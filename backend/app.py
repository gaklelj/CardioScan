import os
import io
import re
import base64
import logging
import threading
import numpy as np
import requests
from PIL import Image
from flask import Flask, send_from_directory, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('cardioscan')
logging.getLogger('werkzeug').setLevel(logging.INFO)
logging.getLogger('engineio').setLevel(logging.WARNING)
logging.getLogger('socketio').setLevel(logging.WARNING)

# ── Keras model ───────────────────────────────────────────────────────────────
import tensorflow as tf

_model_dir = os.environ.get('MODEL_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model'))
MODEL_PATH = os.path.join(_model_dir, 'best_ecg_model.h5')
_expected_len = 1000

if os.path.exists(MODEL_PATH):
    _model = tf.keras.models.load_model(MODEL_PATH)
    _expected_len = _model.input_shape[1]
    log.info('Keras model loaded | input shape: %s', _model.input_shape)
    _dummy = np.zeros((1, _expected_len, 1), dtype=np.float32)
    _model(_dummy, training=False)
    log.info('Model warmed up')
else:
    _model = None
    log.warning('Keras model not found at %s — /points inference disabled', MODEL_PATH)

# ── YOLO model ────────────────────────────────────────────────────────────────
from ultralytics import YOLO as _YOLO

_YOLO_PATH = os.path.join(_model_dir, 'best.pt')
_yolo_model = _YOLO(_YOLO_PATH)
log.info('YOLO model loaded: %s', _YOLO_PATH)


# ── App ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'fallback-dev-key')
CORS(app, origins='*', supports_credentials=False)

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        from flask import Response as _Resp
        r = _Resp()
        r.headers['Access-Control-Allow-Origin'] = '*'
        r.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        r.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return r

@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.before_request
def log_request():
    log.info('→ %s %s', request.method, request.path)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

ECG_CLASSES = ['Normal', 'Atrial Fibrillation', 'Other', 'Noise', 'ST-elevation', 'ST-depression']


# ── Inference ─────────────────────────────────────────────────────────────────
def run_model(ecg_points: list) -> dict:
    if _model is None:
        raise RuntimeError('Keras model not available')
    arr = np.array(ecg_points, dtype=np.float32)

    mn, mx = arr.min(), arr.max()
    if mx - mn > 0:
        arr = (arr - mn) / (mx - mn)

    if len(arr) > _expected_len:
        arr = arr[:_expected_len]
    elif len(arr) < _expected_len:
        arr = np.pad(arr, (0, _expected_len - len(arr)), mode='edge')

    x = arr.reshape(1, _expected_len, 1)
    preds = _model(x, training=False).numpy()[0]

    result = {cls: float(conf) for cls, conf in zip(ECG_CLASSES[:len(preds)], preds)}
    top_class = max(result, key=result.get)

    return {
        'class': top_class,
        'confidence': result[top_class],
        'all': result,
    }


def _yolo_predict(img: Image.Image, confidence: float, overlap: float):
    return _yolo_model.predict(source=img, conf=confidence, iou=overlap, imgsz=640, verbose=False)[0]


def analyze_local_yolo(image_bytes: bytes, confidence: float = 0.20, fmt: str = 'json',
                       overlap: float = 0.30, labels: bool = True):
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img_w, img_h = img.size
    log.info('Image: size=%s conf=%.2f', img.size, confidence)

    # Stage 1: detect Plot regions
    r1 = _yolo_predict(img, confidence=0.10, overlap=overlap)
    plot_cls_id = next((k for k, v in r1.names.items() if v == 'Plot'), 0)
    plots = [r1.boxes.xyxy[i].tolist() for i in range(len(r1.boxes))
             if int(r1.boxes.cls[i].item()) == plot_cls_id]
    log.info('Stage1: %d Plot regions found', len(plots))

    # Stage 2: classify each Plot crop
    predictions = []
    for x1, y1, x2, y2 in plots:
        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
        crop = img.crop((x1, y1, x2, y2))
        r2 = _yolo_predict(crop, confidence=confidence, overlap=overlap)
        for j in range(len(r2.boxes)):
            cls_id = int(r2.boxes.cls[j].item())
            cls_name = r2.names.get(cls_id, f'class_{cls_id}')
            if cls_name == 'Plot':
                continue  # skip nested Plot detections
            conf_val = float(r2.boxes.conf[j].item())
            bx1, by1, bx2, by2 = r2.boxes.xyxy[j].tolist()
            # Translate crop-relative coords back to full image
            predictions.append({
                'x': x1 + (bx1 + bx2) / 2,
                'y': y1 + (by1 + by2) / 2,
                'width': bx2 - bx1,
                'height': by2 - by1,
                'confidence': conf_val,
                'class': re.sub(r'^[\s\-]+|[\s\-]+$', '', cls_name),
            })

    # If no medical classes found, fall back to Plot-level detections (lower conf)
    if not predictions:
        log.info('No medical classes in crops — trying direct low-conf pass')
        r_direct = _yolo_predict(img, confidence=0.05, overlap=overlap)
        for i in range(len(r_direct.boxes)):
            cls_id = int(r_direct.boxes.cls[i].item())
            cls_name = r_direct.names.get(cls_id, f'class_{cls_id}')
            if cls_name == 'Plot':
                continue
            conf_val = float(r_direct.boxes.conf[i].item())
            x1, y1, x2, y2 = r_direct.boxes.xyxy[i].tolist()
            predictions.append({
                'x': (x1 + x2) / 2,
                'y': (y1 + y2) / 2,
                'width': x2 - x1,
                'height': y2 - y1,
                'confidence': conf_val,
                'class': re.sub(r'^[\s\-]+|[\s\-]+$', '', cls_name),
            })

    log.info('Final: %d medical predictions: %s', len(predictions), [p['class'] for p in predictions])

    if fmt == 'image':
        # Draw boxes on original image
        annotated = r1.plot()  # Stage1 annotated (shows Plot boxes)
        annotated_rgb = annotated[:, :, ::-1]
        pil_img = Image.fromarray(annotated_rgb)
        buf = io.BytesIO()
        pil_img.save(buf, format='JPEG')
        return buf.getvalue(), 'image/jpeg'

    return {'predictions': predictions, 'image': {'width': img_w, 'height': img_h}}, None


# ── REST API ──────────────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': 'best.pt', 'keras': _model is not None})


@app.route('/api/ecg/analyze', methods=['POST'])
def ecg_analyze():
    try:
        body = request.get_json(silent=True) or {}

        if 'points' in body:
            result = run_model(body['points'])
            log.info('Local model result: %s (%.2f)', result['class'], result['confidence'])
            return jsonify(result)

        if 'file' in request.files:
            image_bytes = request.files['file'].read()
        elif 'image' in body:
            image_bytes = base64.b64decode(body['image'])
        else:
            return jsonify({'error': 'Передай points (сырые значения) или file/image (изображение)'}), 400

        fmt        = request.args.get('format', 'json')
        confidence = int(request.args.get('confidence', 20))
        overlap    = int(request.args.get('overlap', 30))
        labels     = request.args.get('labels', 'on') == 'on'

        data, content_type = analyze_local_yolo(image_bytes, confidence / 100, fmt, overlap / 100, labels)
        if fmt == 'image':
            from flask import Response
            return Response(data, content_type=content_type)
        return jsonify(data)

    except Exception as e:
        log.error('Analysis error: %s', e)
        return jsonify({'error': str(e)}), 500


# ── AI Summary (direct PollinationsAI — no g4f dependency) ────────────────────
import re as _re
import json as _json

_SPAM_RE = _re.compile(
    r'(https?://\S+|Need\s+prox|cheaper\s+than|visit\s+our|click\s+here|'
    r'buy\s+now|subscribe|discord\.gg|t\.me/|telegram|promo\s+code)',
    _re.IGNORECASE,
)
_IRRELEVANT_RE = _re.compile(
    r'^(hello|hi\b|hey\b|how are you|i\'m doing|thank you|how about you)',
    _re.IGNORECASE,
)

def _clean_summary(text: str) -> str:
    lines = [l for l in text.splitlines() if not _SPAM_RE.search(l)]
    return '\n'.join(lines).strip()

def _is_relevant(text: str) -> bool:
    if _IRRELEVANT_RE.match(text.strip()):
        return False
    return len(text) >= 40

import time as _time
_ai_lock = threading.Lock()

# Groq free tier — fast, reliable. Set GROQ_API_KEY in .env
_GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
_GROQ_MODELS = ['llama-3.1-8b-instant', 'llama3-8b-8192']

# PollinationsAI — fallback, no key needed
_POLLINATIONS_MODELS = ['openai', 'openai-large']


def _try_groq(messages: list) -> str | None:
    if not _GROQ_API_KEY:
        return None
    for model in _GROQ_MODELS:
        try:
            log.info('[AI] trying Groq model=%s', model)
            resp = requests.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={'Authorization': f'Bearer {_GROQ_API_KEY}', 'Content-Type': 'application/json'},
                json={'model': model, 'messages': messages, 'max_tokens': 512},
                timeout=20,
            )
            resp.raise_for_status()
            text = resp.json()['choices'][0]['message']['content'] or ''
            cleaned = _clean_summary(text)
            if _is_relevant(cleaned):
                log.info('[AI] Groq accepted model=%s (%d chars)', model, len(cleaned))
                return cleaned
        except Exception as e:
            log.warning('[AI] Groq model=%s failed: %s', model, e)
    return None


def _try_pollinations(messages: list) -> str | None:
    for attempt, model in enumerate(_POLLINATIONS_MODELS):
        if attempt > 0:
            _time.sleep(2)
        try:
            log.info('[AI] trying PollinationsAI model=%s', model)
            resp = requests.post(
                'https://text.pollinations.ai/openai',
                json={'model': model, 'messages': messages},
                timeout=30,
            )
            if resp.status_code == 429:
                _time.sleep(3)
                resp = requests.post(
                    'https://text.pollinations.ai/openai',
                    json={'model': model, 'messages': messages},
                    timeout=30,
                )
            resp.raise_for_status()
            text = resp.json()['choices'][0]['message']['content'] or ''
            cleaned = _clean_summary(text)
            if _is_relevant(cleaned):
                log.info('[AI] Pollinations accepted model=%s (%d chars)', model, len(cleaned))
                return cleaned
            log.warning('[AI] Pollinations model=%s irrelevant or too short', model)
        except Exception as e:
            log.warning('[AI] Pollinations model=%s failed: %s', model, e)
    return None


def _call_g4f(messages: list) -> str:
    with _ai_lock:
        result = _try_groq(messages)
        if result:
            return result
        result = _try_pollinations(messages)
        if result:
            return result
        raise RuntimeError('All AI providers failed. Add GROQ_API_KEY to .env for reliable access.')


@app.route('/api/ecg/summary', methods=['POST'])
def ecg_summary():
    try:
        body = request.get_json(silent=True) or {}
        predictions = body.get('predictions', [])
        lang = body.get('lang', 'en')

        log.info('[summary] received %d predictions, lang=%s', len(predictions), lang)

        if not predictions:
            return jsonify({'summary': ''})

        # Группируем: класс → {count, max_conf, all_confs}
        groups = {}
        for p in predictions:
            cls = p.get('class', 'Unknown')
            conf = p.get('confidence', 0)
            if cls not in groups:
                groups[cls] = {'count': 0, 'max_conf': 0.0, 'confs': []}
            groups[cls]['count'] += 1
            groups[cls]['confs'].append(round(conf * 100, 1))
            groups[cls]['max_conf'] = max(groups[cls]['max_conf'], conf)

        log.info('[summary] grouped findings:')
        findings_lines = []
        for cls, v in groups.items():
            avg = sum(v['confs']) / len(v['confs'])
            line = (
                f"  - {cls}: detected {v['count']} time(s), "
                f"max confidence {v['max_conf']*100:.1f}%, "
                f"avg confidence {avg:.1f}%, "
                f"all scores: {v['confs']}"
            )
            log.info(line)
            findings_lines.append(
                f"- {cls}: {v['count']} occurrence(s), "
                f"max {v['max_conf']*100:.0f}%, avg {avg:.0f}%"
            )

        findings_block = '\n'.join(findings_lines)

        if lang == 'kz':
            system_msg = (
                'Сен ЭКГ нәтижелерін қорытындылайтын медициналық көмекшісің. '
                'Тек қазақ тілінде жауап бер. Тек медициналық мәтін. '
                'URL, жарнама, markdown, сәлемдесу болмасын.'
            )
            user_content = (
                f'ЭКГ талдауының нәтижелері:\n{findings_block}\n\n'
                f'Осы нәтижелер бойынша қысқаша клиникалық қорытынды (2-3 сөйлем) '
                f'және 1-2 практикалық ұсыныс жаз. Диагноз қойма. '
                f'Не анықталғанын сипатта және дәрігерге баруды ұсын.'
            )
        elif lang == 'en':
            system_msg = (
                'You are a concise medical assistant summarizing ECG detection results. '
                'Plain medical text only. No URLs, ads, markdown, or greetings.'
            )
            user_content = (
                f'ECG analysis results:\n{findings_block}\n\n'
                f'Write a 2-3 sentence clinical summary and 1-2 practical recommendations. '
                f'Do not diagnose. Describe what was detected and advise seeing a doctor.'
            )
        else:  # ru + default
            system_msg = (
                'Ты краткий медицинский ассистент, составляющий сводку по результатам ЭКГ. '
                'Только чистый медицинский текст на русском языке. '
                'Без URL, рекламы, markdown, приветствий.'
            )
            user_content = (
                f'Результаты анализа ЭКГ:\n{findings_block}\n\n'
                f'Напиши краткую клиническую сводку (2-3 предложения) и 1-2 практические рекомендации. '
                f'Не ставь диагноз. Опиши что обнаружено и посоветуй обратиться к врачу.'
            )

        log.info('[summary] lang=%s | user_content:\n%s', lang, user_content)

        messages = [
            {'role': 'system', 'content': system_msg},
            {'role': 'user',   'content': user_content},
        ]

        log.info('[summary] sending to G4F:\n%s', user_content)

        summary = _call_g4f(messages)
        log.info('[summary] final summary:\n%s', summary)
        return jsonify({'summary': summary})

    except Exception as e:
        log.error('[summary] error: %s', e)
        return jsonify({'error': str(e)}), 500


# ── Serial / Bluetooth ECG device ─────────────────────────────────────────────
import serial
import serial.tools.list_ports
import threading

_serial_thread = None
_serial_running = False
_serial_port    = None

ECG_KEYWORDS = ['ESP32', 'CP210', 'CH340', 'FTDI', 'usbserial', 'usbmodem', 'Bluetooth']

def _find_ecg_port():
    """Найти порт ESP32 (USB или Bluetooth Serial)."""
    ports = serial.tools.list_ports.comports()
    for p in ports:
        desc = f'{p.description} {p.hwid} {p.name}'
        if any(k.lower() in desc.lower() for k in ECG_KEYWORDS):
            return p.device
    # fallback: первый доступный порт
    return ports[0].device if ports else None

def _serial_reader(port_name, baud=115200):
    global _serial_running, _serial_port, ecg_buffer
    try:
        _serial_port = serial.Serial(port_name, baud, timeout=1)
        log.info('Serial opened: %s @ %d', port_name, baud)
        socketio.emit('device_status', {'connected': True, 'port': port_name})
        while _serial_running:
            try:
                line = _serial_port.readline().decode('utf-8', errors='ignore').strip()
                if not line:
                    continue
                value = int(line)
                socketio.emit('ecg_point', {'value': value})
                ecg_buffer.append(value)
                if len(ecg_buffer) >= BUFFER_SIZE:
                    try:
                        result = run_model(ecg_buffer[-BUFFER_SIZE:])
                        socketio.emit('ecg_analysis', result)
                        log.info('Live analysis: %s (%.2f)', result['class'], result['confidence'])
                    except Exception as e:
                        log.error('Live analysis error: %s', e)
                    ecg_buffer = []
            except (ValueError, UnicodeDecodeError):
                pass
            except Exception as e:
                log.error('Serial read error: %s', e)
                break
    except Exception as e:
        log.error('Cannot open serial %s: %s', port_name, e)
        socketio.emit('device_status', {'connected': False, 'error': str(e)})
    finally:
        if _serial_port and _serial_port.is_open:
            _serial_port.close()
        socketio.emit('device_status', {'connected': False})
        log.info('Serial closed')


@socketio.on('check_ecg_device')
def handle_check_device():
    port = _find_ecg_port()
    if port:
        emit('device_status', {'connected': True, 'port': port})
    else:
        emit('device_status', {'connected': False})


@socketio.on('start_ecg')
def handle_start_ecg():
    global _serial_thread, _serial_running
    if _serial_thread and _serial_thread.is_alive():
        return
    port = _find_ecg_port()
    if not port:
        emit('device_status', {'connected': False})
        return
    _serial_running = True
    _serial_thread = threading.Thread(target=_serial_reader, args=(port,), daemon=True)
    _serial_thread.start()


@socketio.on('stop_ecg')
def handle_stop_ecg():
    global _serial_running
    _serial_running = False


# ── WebSocket — лайв-стриминг ─────────────────────────────────────────────────
ecg_buffer = []
BUFFER_SIZE = _expected_len


@socketio.on('ecg_data')
def handle_ecg_data(data):
    global ecg_buffer
    ecg_buffer.append(data['value'])
    emit('ecg_point', data, broadcast=True)

    if len(ecg_buffer) >= BUFFER_SIZE:
        try:
            result = run_model(ecg_buffer[-BUFFER_SIZE:])
            emit('ecg_analysis', result, broadcast=True)
            log.info('Live analysis: %s (%.2f)', result['class'], result['confidence'])
        except Exception as e:
            log.error('Live analysis error: %s', e)
        ecg_buffer = []


@socketio.on('ecg_batch')
def handle_ecg_batch(data):
    points = data.get('points', [])
    emit('ecg_batch', data, broadcast=True)

    if points:
        try:
            result = run_model(points)
            emit('ecg_analysis', result, broadcast=True)
            log.info('Batch analysis: %s (%.2f)', result['class'], result['confidence'])
        except Exception as e:
            log.error('Batch analysis error: %s', e)
            emit('ecg_error', {'error': str(e)})


# ── Frontend ──────────────────────────────────────────────────────────────────
DIST_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'dist')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    if path and os.path.exists(os.path.join(DIST_DIR, path)):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, 'index.html')


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    log.info('CardioScan backend starting on http://0.0.0.0:6767')
    socketio.run(app, host='0.0.0.0', port=6767, allow_unsafe_werkzeug=True)
