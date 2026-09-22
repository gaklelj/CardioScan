from gevent import monkey
monkey.patch_all()

import os
import base64
import logging
import numpy as np
import requests
from flask import Flask, send_from_directory, request, jsonify
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('cardioscan')
logging.getLogger('werkzeug').setLevel(logging.WARNING)
logging.getLogger('engineio').setLevel(logging.WARNING)
logging.getLogger('socketio').setLevel(logging.WARNING)

# ── Keras model ───────────────────────────────────────────────────────────────
import tensorflow as tf

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model', 'best_ecg_model.h5')
model = tf.keras.models.load_model(MODEL_PATH)
input_shape = model.input_shape
log.info('Model loaded | input shape: %s | output shape: %s', input_shape, model.output_shape)

# Прогрев — первый инференс всегда медленный, делаем его до первого запроса
_dummy = np.zeros((1, input_shape[1], 1), dtype=np.float32)
model.predict(_dummy, verbose=0)
log.info('Model warmed up')

# ── App ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'fallback-dev-key')
socketio = SocketIO(app, cors_allowed_origins="*")

ROBOFLOW_API_KEY = os.getenv('ROBOFLOW_API_KEY', '')
ROBOFLOW_PROJECT = os.getenv('ROBOFLOW_PROJECT', 'ecg.analyze')
ROBOFLOW_VERSION = os.getenv('ROBOFLOW_VERSION', '5')

ECG_CLASSES = ['Normal', 'Atrial Fibrillation', 'Other', 'Noise', 'ST-elevation', 'ST-depression']


# ── Inference ─────────────────────────────────────────────────────────────────
def run_model(ecg_points: list) -> dict:
    """
    Принимает список float-значений ЭКГ от приложения.
    Нормализует, формирует батч под input_shape модели и возвращает предсказание.
    """
    arr = np.array(ecg_points, dtype=np.float32)

    # Нормализация 0–1
    mn, mx = arr.min(), arr.max()
    if mx - mn > 0:
        arr = (arr - mn) / (mx - mn)

    # Подгоняем длину под ожидаемый размер модели
    expected_len = input_shape[1]  # второй dim (timesteps)
    if len(arr) > expected_len:
        arr = arr[:expected_len]
    elif len(arr) < expected_len:
        arr = np.pad(arr, (0, expected_len - len(arr)), mode='edge')

    # (1, timesteps, 1)
    x = arr.reshape(1, expected_len, 1)

    preds = model.predict(x, verbose=0)[0]  # shape: (num_classes,)

    result = {cls: float(conf) for cls, conf in zip(ECG_CLASSES[:len(preds)], preds)}
    top_class = max(result, key=result.get)

    return {
        'class': top_class,
        'confidence': result[top_class],
        'all': result,
    }


def analyze_roboflow(image_bytes: bytes) -> dict:
    url = (
        f"https://detect.roboflow.com/{ROBOFLOW_PROJECT}/{ROBOFLOW_VERSION}"
        f"?api_key={ROBOFLOW_API_KEY}"
    )
    resp = requests.post(url, files={"file": image_bytes}, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── REST API ──────────────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': 'best_ecg_model.h5'})


@app.route('/api/ecg/analyze', methods=['POST'])
def ecg_analyze():
    """
    Анализ ЭКГ через локальную модель.

    JSON: { "points": [0.1, 0.4, 0.9, ...] }          — сырые значения
    JSON: { "image": "<base64>" }                       — изображение → Roboflow
    multipart: поле 'file'                              — изображение → Roboflow
    """
    try:
        body = request.get_json(silent=True) or {}

        if 'points' in body:
            result = run_model(body['points'])
            log.info('Local model result: %s (%.2f)', result['class'], result['confidence'])
            return jsonify(result)

        # Изображение → Roboflow
        if 'file' in request.files:
            image_bytes = request.files['file'].read()
        elif 'image' in body:
            image_bytes = base64.b64decode(body['image'])
        else:
            return jsonify({'error': 'Передай points (сырые значения) или file/image (изображение)'}), 400

        predictions = analyze_roboflow(image_bytes)
        return jsonify(predictions)

    except requests.RequestException as e:
        log.error('Roboflow error: %s', e)
        return jsonify({'error': 'Roboflow недоступен'}), 503
    except Exception as e:
        log.error('Analysis error: %s', e)
        return jsonify({'error': str(e)}), 500


# ── WebSocket — лайв-стриминг ─────────────────────────────────────────────────
ecg_buffer = []
BUFFER_SIZE = input_shape[1]  # берём из модели автоматически (сейчас 1000)


@socketio.on('ecg_data')
def handle_ecg_data(data):
    """
    Принимает одну точку от приложения.
    Формат: {'value': float, 'timestamp': int}
    Когда накопится BUFFER_SIZE точек — прогоняет через модель и отдаёт результат.
    """
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
    """
    Оффлайн пакет данных с ESP32.
    Формат: { 'points': [float, ...] }
    """
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
    socketio.run(app, host='0.0.0.0', port=6767)
