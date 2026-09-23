import os
import base64
import logging
import numpy as np
import requests
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
_model = tf.keras.models.load_model(MODEL_PATH)
_expected_len = _model.input_shape[1]  # 1000
log.info('Keras model loaded | input shape: %s', _model.input_shape)

# Прогрев
_dummy = np.zeros((1, _expected_len, 1), dtype=np.float32)
_model(_dummy, training=False)
log.info('Model warmed up')

# ── App ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'fallback-dev-key')
CORS(app)

@app.before_request
def log_request():
    log.info('→ %s %s', request.method, request.path)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

ROBOFLOW_API_KEY = os.getenv('ROBOFLOW_API_KEY', '')
ROBOFLOW_PROJECT = os.getenv('ROBOFLOW_PROJECT', 'ecg.analyze')
ROBOFLOW_VERSION = os.getenv('ROBOFLOW_VERSION', '5')

ECG_CLASSES = ['Normal', 'Atrial Fibrillation', 'Other', 'Noise', 'ST-elevation', 'ST-depression']


# ── Inference ─────────────────────────────────────────────────────────────────
def run_model(ecg_points: list) -> dict:
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


def analyze_roboflow(image_bytes: bytes, confidence: int = 20, fmt: str = 'json',
                     overlap: int = 30, labels: bool = True, stroke: int = 2):
    url = (
        f"https://detect.roboflow.com/{ROBOFLOW_PROJECT}/{ROBOFLOW_VERSION}"
        f"?api_key={ROBOFLOW_API_KEY}&confidence={confidence}&overlap={overlap}&format={fmt}"
    )
    if fmt == 'image':
        url += f'&labels={"on" if labels else "off"}&stroke={stroke}'
    resp = requests.post(url, files={"file": image_bytes}, timeout=30)
    resp.raise_for_status()
    if fmt == 'image':
        return resp.content, resp.headers.get('Content-Type', 'image/jpeg')
    return resp.json(), None


# ── REST API ──────────────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': 'best_ecg_model.h5'})


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
        stroke     = int(request.args.get('stroke', 2))

        data, content_type = analyze_roboflow(image_bytes, confidence, fmt, overlap, labels, stroke)
        if fmt == 'image':
            from flask import Response
            return Response(data, content_type=content_type)
        return jsonify(data)

    except requests.RequestException as e:
        log.error('Roboflow error: %s', e)
        return jsonify({'error': 'Roboflow недоступен'}), 503
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

# PollinationsAI OpenAI-compatible endpoint — free, no API key
_POLLINATIONS_MODELS = ['mistral', 'openai', 'openai-large']

def _call_g4f(messages: list) -> str:
    last_err = None
    for model in _POLLINATIONS_MODELS:
        try:
            log.info('[AI] trying PollinationsAI model=%s', model)
            resp = requests.post(
                'https://text.pollinations.ai/openai',
                json={'model': model, 'messages': messages},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            text = data['choices'][0]['message']['content'] or ''
            log.info('[AI] raw response model=%s:\n%s', model, text[:200])
            cleaned = _clean_summary(text)
            if _is_relevant(cleaned):
                log.info('[AI] accepted model=%s (%d chars)', model, len(cleaned))
                return cleaned
            log.warning('[AI] model=%s response irrelevant or too short, skipping', model)
        except Exception as e:
            last_err = e
            log.warning('[AI] model=%s failed: %s', model, e)
    raise RuntimeError(f'All AI providers failed. Last error: {last_err}')


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
