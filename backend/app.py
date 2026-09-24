import os
from ecg_protocol import normalize_sample as _normalize_sample, parse_sample_line as _parse_sample_line, validate_channels, parse_tcp_frame
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
_model_dir = os.environ.get('MODEL_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model'))
MODEL_PATH = os.path.join(_model_dir, 'best_ecg_model.h5')
from ecg_inference import ThreeLeadPredictor
_three_path = os.environ.get('ECG_THREE_LEAD_MODEL', os.path.join(_model_dir, 'ecg_ads1293.pt'))
_three_model = ThreeLeadPredictor(_three_path) if os.path.exists(_three_path) else None
log.info('Three-lead ECG model: %s', _three_path if _three_model else 'unavailable')
_expected_len = 1000

_model = None
if os.path.exists(MODEL_PATH):
    try:
        import tensorflow as tf
        _model = tf.keras.models.load_model(MODEL_PATH)
        _expected_len = _model.input_shape[1]
        _model(np.zeros((1, _expected_len, 1), dtype=np.float32), training=False)
        log.info('Legacy Keras model loaded')
    except Exception as exc:
        _model = None
        log.warning('Legacy single-lead model unavailable: %s', exc)

# ── YOLO model ────────────────────────────────────────────────────────────────
_YOLO_PATH = os.path.join(_model_dir, 'best.pt')
_yolo_model = None
try:
    from ultralytics import YOLO as _YOLO
    if os.path.exists(_YOLO_PATH):
        _yolo_model = _YOLO(_YOLO_PATH)
        log.info('YOLO model loaded: %s', _YOLO_PATH)
except ImportError as exc:
    log.warning('Image model unavailable: %s', exc)


# ── App ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'fallback-dev-key')
@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        return add_cors(app.make_default_options_response())

@app.before_request
def log_request():
    log.info('→ %s %s', request.method, request.path)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

ECG_CLASSES = ['CD', 'HYP', 'MI', 'STTC', 'NORM', 'NOISE']


# ── Inference ─────────────────────────────────────────────────────────────────
def run_model(ecg_points: list) -> dict:
    if _model is None:
        raise RuntimeError('Keras model not available')
    ecg_points = validate_channels([ecg_points])[0]
    arr = np.array(ecg_points, dtype=np.float32)

    mean, std = arr.mean(), arr.std()
    if std > 0:
        arr = (arr - mean) / (std + 1e-8)

    if len(arr) > _expected_len:
        arr = arr[:_expected_len]
    elif len(arr) < _expected_len:
        arr = np.pad(arr, (0, _expected_len - len(arr)), mode='edge')

    x = arr.reshape(1, _expected_len, 1)
    preds = _model(x, training=False).numpy()[0]

    result = {cls: float(conf) for cls, conf in zip(ECG_CLASSES[:len(preds)], preds)}
    top_class = max(result, key=result.get)
    top_conf = result[top_class]

    return {
        'class': top_class if top_conf >= 0.50 else 'Uncertain',
        'confidence': top_conf,
        'all': result,
        'analysis_channel': 'CH1',
    }


def analyze_channels(channels, metadata=None):
    channels = validate_channels(channels)
    if len(channels) == 1:
        return run_model(channels[0])
    if _three_model is None:
        raise RuntimeError('Three-lead model is unavailable')
    metadata = metadata or {}
    return _three_model.analyze(channels[:3], metadata.get('sample_rate_hz'),
                                metadata.get('timing'), metadata.get('missing_samples', 0))


def _yolo_predict(img: Image.Image, confidence: float, overlap: float):
    if _yolo_model is None:
        raise RuntimeError('Image model is unavailable; install ultralytics and provide best.pt')
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
    return jsonify({'status': 'ok', 'model': 'best.pt', 'keras': _model is not None,
                    'yolo': _yolo_model is not None,
                    'three_lead': _three_model is not None, 'ecg_model': 'ecg_ads1293' if _three_model else None})


@app.route('/api/ecg/analyze', methods=['POST'])
def ecg_analyze():
    try:
        body = request.get_json(silent=True) or {}

        if 'channels' in body:
            channels = validate_channels(body['channels'])
            result = analyze_channels(channels, body)
            result['channels'] = len(channels)
            log.info('Local model result: %s (%.2f), channels=%s', result['class'], result['confidence'], result['channels'])
            return jsonify(result)

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

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        log.error('Analysis error: %s', e)
        return jsonify({'error': str(e)}), 500


# ── Meta Risk Model ──────────────────────────────────────────────────────────
from meta_risk_model import predict_risk as _predict_risk, MODEL_PATH as _META_MODEL_PATH

if os.path.exists(_META_MODEL_PATH):
    log.info('Meta risk model found: %s', _META_MODEL_PATH)
else:
    log.warning('Meta risk model not found at %s — /api/risk-assessment disabled', _META_MODEL_PATH)

# ECG_CLASSES mapping: backend class names → meta-model prob fields
_ECG_TO_PROB = {'NORM': 'prob_norm', 'STTC': 'prob_sttc', 'MI': 'prob_mi', 'HYP': 'prob_hyp', 'CD': 'prob_cd'}


@app.route('/api/risk-assessment', methods=['POST'])
def risk_assessment():
    try:
        body = request.get_json(silent=True) or {}

        # ECG probabilities — from ЭКГ neural network output
        ecg = body.get('ecg_probabilities', {})
        prob_norm = float(ecg.get('prob_norm', ecg.get('NORM', 0)))
        prob_sttc = float(ecg.get('prob_sttc', ecg.get('STTC', 0)))
        prob_mi   = float(ecg.get('prob_mi',   ecg.get('MI',   0)))
        prob_hyp  = float(ecg.get('prob_hyp',  ecg.get('HYP',  0)))
        prob_cd   = float(ecg.get('prob_cd',   ecg.get('CD',   0)))

        # Normalize to sum=1.0 (NOISE class excluded)
        ecg_sum = prob_norm + prob_sttc + prob_mi + prob_hyp + prob_cd
        if ecg_sum > 0:
            prob_norm /= ecg_sum
            prob_sttc /= ecg_sum
            prob_mi   /= ecg_sum
            prob_hyp  /= ecg_sum
            prob_cd   /= ecg_sum

        # Demographics
        demo = body.get('demographics') or {}
        required = ('age', 'sex', 'sbp', 'cholesterol', 'smoking')
        missing = [key for key in required if demo.get(key) in (None, '')]
        if body.get('rose_flag') in (None, ''):
            missing.append('rose_flag')
        if missing:
            return jsonify({'status': 'insufficient_data', 'missing_fields': missing}), 422
        try:
            values = {key: float(demo[key]) for key in required}
            rose_flag = float(body['rose_flag'])
            bounds = {'age': (18, 100), 'sbp': (50, 300), 'cholesterol': (0.1, 30)}
            if any(not lo <= values[key] <= hi for key, (lo, hi) in bounds.items()):
                raise ValueError('Patient data outside supported range')
            if values['age'] % 1 or values['sbp'] % 1 or any(values[key] not in (0, 1) for key in ('sex', 'smoking')) or rose_flag not in (0, 1):
                raise ValueError('Invalid patient data')
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid patient data'}), 400
        age, sex = int(values['age']), int(values['sex'])
        sbp, cholesterol = values['sbp'], values['cholesterol']
        smoking, rose_flag = int(values['smoking']), int(rose_flag)

        result = _predict_risk(
            prob_norm=prob_norm, prob_sttc=prob_sttc, prob_mi=prob_mi,
            prob_hyp=prob_hyp, prob_cd=prob_cd,
            age=age, sex=sex, sbp=sbp, cholesterol=cholesterol,
            smoking=smoking, rose_flag=rose_flag,
        )

        log.info('Risk assessment: %s (mortality %.1f%%)', result['risk_class'], result['mortality_10y'])
        return jsonify(result)

    except Exception as e:
        log.error('Risk assessment error: %s', e)
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


# ── Serial / WiFi ECG device ─────────────────────────────────────────────
import serial
import serial.tools.list_ports
import threading

_ecg_thread   = None
_ecg_running  = False
_serial_port  = None
_ecg_owner_sid = None  # socket id, который запустил сканирование

USB_KEYWORDS  = ['CP210', 'CH340', 'FTDI', 'usbserial', 'usbmodem', 'USB']
ESP32_WIFI_HOST = '192.168.4.1'   # дефолтный IP точки доступа ESP32
ESP32_WIFI_PORT = 3333            # TCP CSV stream

def _find_usb_port():
    ports = serial.tools.list_ports.comports()
    for p in ports:
        desc = f'{p.description} {p.hwid} {p.name}'
        if any(k.lower() in desc.lower() for k in USB_KEYWORDS):
            return p.device
    return None

ECG_CHANNELS = 4


def _emit_ecg_point(sample):
    global ecg_buffer
    channels = _normalize_sample(sample)
    metadata = sample if isinstance(sample, dict) else {}
    socketio.emit('ecg_point', {**metadata, 'value': channels[0], 'channels': channels})
    for index, value in enumerate(channels):
        ecg_buffer[index].append(value)
    if len(ecg_buffer[0]) >= BUFFER_SIZE and len(channels) == 1:
        try:
            result = run_model(ecg_buffer[0][-BUFFER_SIZE:])
            socketio.emit('ecg_analysis', result)
            log.info('Live analysis: %s (%.2f)', result['class'], result['confidence'])
        except Exception as e:
            log.error('Live analysis error: %s', e)
        ecg_buffer = [[] for _ in range(ECG_CHANNELS)]
    elif len(channels) >= 3:
        # Three-lead recordings are analyzed by REST with acquisition timing.
        ecg_buffer = [[] for _ in range(ECG_CHANNELS)]

def _serial_reader(port_name, baud=115200):
    global _ecg_running, _serial_port
    # Закрываем предыдущее соединение если не закрылось — иначе порт "занят"
    try:
        if _serial_port and _serial_port.is_open:
            _serial_port.close()
            log.info('Closed previous serial port before reopening')
    except Exception:
        pass
    try:
        _serial_port = serial.Serial(port_name, baud, timeout=2)
        log.info('Serial opened: %s @ %d', port_name, baud)
        socketio.emit('device_status', {'connected': True, 'port': port_name})
        while _ecg_running:
            try:
                line = _serial_port.readline().decode('utf-8', errors='ignore').strip()
                if not line:
                    continue
                _emit_ecg_point(parse_tcp_frame(line) if len(line.split(',')) in (6, 7) else _parse_sample_line(line))
            except ValueError:
                pass
            except Exception as e:
                log.error('Serial read error: %s', e)
                break
    except Exception as e:
        log.error('Cannot open serial %s: %s', port_name, e)
        socketio.emit('device_status', {'connected': False, 'error': str(e)})
    finally:
        try:
            if _serial_port and _serial_port.is_open:
                _serial_port.close()
        except Exception:
            pass
        _ecg_running = False
        socketio.emit('device_status', {'connected': False}, to=_ecg_owner_sid)
        log.info('Serial closed')

def _wifi_reader(host=ESP32_WIFI_HOST, port=ESP32_WIFI_PORT):
    global _ecg_running
    import socket
    pending = ''
    previous = None
    missing = 0
    rate_start = None
    sample_rate = None
    idle_reads = 0
    try:
        with socket.create_connection((host, port), timeout=5) as connection:
            connection.settimeout(1)
            socketio.emit('device_status', {'connected': True, 'port': f'TCP {host}:{port}'})
            while _ecg_running:
                try:
                    chunk = connection.recv(65536)
                except socket.timeout:
                    idle_reads += 1
                    if idle_reads >= 5:
                        raise ConnectionError('No data from ESP32 for 5 seconds')
                    continue
                idle_reads = 0
                if not chunk:
                    raise ConnectionError('ESP32 closed the TCP connection')
                pending += chunk.decode('ascii', errors='replace')
                lines = pending.split('\n')
                pending = lines.pop()
                if len(pending) > 4096:
                    raise ValueError('TCP frame exceeds maximum length')
                frames = []
                for line in lines:
                    try:
                        frame = parse_tcp_frame(line)
                    except ValueError:
                        continue
                    if previous is not None:
                        delta = (frame['sequence'] - previous) & 0xFFFFFFFF
                        if 1 < delta < 0x80000000:
                            missing += delta - 1
                    previous = frame['sequence']
                    if rate_start is None:
                        rate_start = (frame['timestamp_us'], frame['sequence'])
                    elapsed = frame['timestamp_us'] - rate_start[0]
                    if elapsed >= 1000000:
                        sample_rate = round(((frame['sequence'] - rate_start[1]) & 0xFFFFFFFF) * 1000000 / elapsed, 1)
                        rate_start = (frame['timestamp_us'], frame['sequence'])
                    frames.append(frame)
                if frames and _ecg_running:
                    socketio.emit('ecg_frames', {'frames': frames, 'sample_rate_hz': sample_rate,
                                               'missing_samples': missing}, to=_ecg_owner_sid)
    except Exception as exc:
        log.error('TCP ECG read error: %s', exc)
        socketio.emit('ecg_error', {'error': str(exc)}, to=_ecg_owner_sid)
    finally:
        _ecg_running = False
        socketio.emit('device_status', {'connected': False}, to=_ecg_owner_sid)


@socketio.on('check_ecg_device')
def handle_check_device(data=None):
    mode = (data or {}).get('mode', 'usb')
    if mode not in ('usb', 'wifi'):
        emit('ecg_error', {'error': 'Unsupported connection mode'})
        return
    if mode == 'wifi':
        import socket as _sock
        try:
            s = _sock.create_connection((ESP32_WIFI_HOST, ESP32_WIFI_PORT), timeout=2)
            s.close()
            emit('device_status', {'connected': True, 'port': f'WiFi {ESP32_WIFI_HOST}'})
        except Exception:
            emit('device_status', {'connected': False})
    else:
        port = _find_usb_port()
        emit('device_status', {'connected': bool(port), 'port': port or ''})


@socketio.on('start_ecg')
def handle_start_ecg(data=None):
    global _ecg_thread, _ecg_running, _ecg_owner_sid, ecg_buffer
    if _ecg_thread and _ecg_thread.is_alive():
        return
    mode = (data or {}).get('mode', 'usb')
    if mode not in ('usb', 'wifi'):
        emit('ecg_error', {'error': 'Unsupported connection mode'})
        return
    ecg_buffer = [[] for _ in range(ECG_CHANNELS)]
    _ecg_running = True
    _ecg_owner_sid = request.sid
    log.info('ECG started by sid=%s mode=%s', request.sid, mode)
    if mode == 'wifi':
        _ecg_thread = threading.Thread(target=_wifi_reader, daemon=True)
    else:
        port = _find_usb_port()
        if not port:
            emit('device_status', {'connected': False})
            _ecg_running = False
            return
        _ecg_thread = threading.Thread(target=_serial_reader, args=(port,), daemon=True)
    _ecg_thread.start()


@socketio.on('stop_ecg')
def handle_stop_ecg():
    global _ecg_running, _ecg_owner_sid
    if _ecg_owner_sid and request.sid != _ecg_owner_sid:
        log.info('stop_ecg ignored from sid=%s (owner=%s)', request.sid, _ecg_owner_sid)
        return
    log.info('ECG stopped by sid=%s', request.sid)
    _ecg_running = False
    _ecg_owner_sid = None


@socketio.on('disconnect')
def handle_ecg_disconnect(reason=None):
    global _ecg_running
    if request.sid == _ecg_owner_sid:
        _ecg_running = False


# ── WebSocket — лайв-стриминг ─────────────────────────────────────────────────
ecg_buffer = [[] for _ in range(ECG_CHANNELS)]
BUFFER_SIZE = _expected_len


@socketio.on('ecg_data')
def handle_ecg_data(data):
    global ecg_buffer
    try:
        channels = _normalize_sample(data)
    except ValueError as exc:
        emit('ecg_error', {'error': str(exc)})
        return
    data = {**data, 'value': channels[0], 'channels': channels}
    for index, value in enumerate(channels):
        ecg_buffer[index].append(value)
    emit('ecg_point', data, broadcast=True)

    if len(ecg_buffer[0]) >= BUFFER_SIZE and len(channels) == 1:
        try:
            result = run_model(ecg_buffer[0][-BUFFER_SIZE:])
            emit('ecg_analysis', result, broadcast=True)
            log.info('Live analysis: %s (%.2f)', result['class'], result['confidence'])
        except Exception as e:
            log.error('Live analysis error: %s', e)
        ecg_buffer = [[] for _ in range(ECG_CHANNELS)]
    elif len(channels) >= 3:
        ecg_buffer = [[] for _ in range(ECG_CHANNELS)]


@socketio.on('ecg_batch')
def handle_ecg_batch(data):
    try:
        channels = validate_channels(data['channels'] if 'channels' in data else [data.get('points', [])])
    except (ValueError, TypeError) as exc:
        emit('ecg_error', {'error': str(exc)})
        return
    points = channels[0]
    data = {**data, 'channels': channels}
    emit('ecg_batch', data, broadcast=True)

    if points:
        try:
            result = analyze_channels(channels, data)
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
