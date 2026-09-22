from gevent import monkey
monkey.patch_all()

import cv2
import mss
import numpy as np
import grequests
import base64
from flask import Flask, send_from_directory
import os
import logging
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

load_dotenv()

# ── Logging setup ────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('cardioscan')

# Убираем шум от werkzeug и socketio
logging.getLogger('werkzeug').setLevel(logging.WARNING)
logging.getLogger('engineio').setLevel(logging.WARNING)
logging.getLogger('socketio').setLevel(logging.WARNING)

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'fallback-dev-key-change-in-production')
socketio = SocketIO(app, cors_allowed_origins="*")

API_KEY     = os.getenv('ROBOFLOW_API_KEY', '')
PROJECT_NAME = os.getenv('ROBOFLOW_PROJECT', 'ecg.analyze')
MODEL_VERSION = os.getenv('ROBOFLOW_VERSION', '5')

capturing    = False
ecg_scanning = False


# ── Serial ECG helpers ──────────────────────────────────────────────

def find_ecg_port():
    if not SERIAL_AVAILABLE:
        return None
    ports = serial.tools.list_ports.comports()
    for p in ports:
        desc = p.description.lower()
        if any(kw in desc for kw in ['arduino', 'ch340', 'cp210', 'ftdi', 'usb serial', 'usbmodem', 'usbserial']):
            return p.device
    return ports[0].device if ports else None


def read_ecg_serial(port):
    global ecg_scanning
    try:
        conn = serial.Serial(port, 115200, timeout=1)
        socketio.sleep(2)  # wait for Arduino reset
        while ecg_scanning:
            try:
                line = conn.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    value = float(line)
                    socketio.emit('ecg_point', {'value': value})
            except (ValueError, Exception):
                pass
        conn.close()
    except Exception as e:
        log.error('ECG serial error: %s', e)
        socketio.emit('device_status', {'connected': False, 'error': str(e)})
    finally:
        log.info('ECG scan finished')
        socketio.emit('ecg_scan_done')


@socketio.on('check_ecg_device')
def handle_check_ecg_device():
    port = find_ecg_port()
    if port:
        log.info('ECG device found: %s', port)
        emit('device_status', {'connected': True, 'port': port, 'baud_rate': 115200})
    else:
        log.warning('ECG device not found')
        emit('device_status', {'connected': False})


@socketio.on('start_ecg')
def handle_start_ecg():
    global ecg_scanning
    port = find_ecg_port()
    if not port:
        log.warning('start_ecg: no device found')
        emit('device_status', {'connected': False})
        return
    log.info('Starting ECG on %s', port)
    ecg_scanning = True
    socketio.start_background_task(read_ecg_serial, port)


@socketio.on('stop_ecg')
def handle_stop_ecg():
    global ecg_scanning
    log.info('Stopping ECG')
    ecg_scanning = False


def predict(image):
    url = f"https://detect.roboflow.com/{PROJECT_NAME}/{MODEL_VERSION}?api_key={API_KEY}"
    _, img_encoded = cv2.imencode('.jpg', image)
    request = grequests.post(url, files={"file": img_encoded.tobytes()})
    response = grequests.map([request])[0] 
    predictions = response.json()
    return predictions

def draw_bounding_boxes(image, predictions):
    for prediction in predictions.get('predictions', []):
        x = prediction['x']
        y = prediction['y']
        width = prediction['width']
        height = prediction['height']
        label = prediction['class']
        confidence = prediction['confidence']

        x1 = int(x - width / 2)
        y1 = int(y - height / 2)
        x2 = int(x + width / 2)
        y2 = int(y + height / 2)

        cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(image, f"{label} {confidence:.2f}", (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    return image

def capture_and_process_screen():
    global capturing
    capturing = True
    sct = mss.mss()
    monitor = sct.monitors[1] 

    while capturing:
        screen_shot = sct.grab(monitor)
        img = np.array(screen_shot)
        img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)

        predictions = predict(img)

        if 'predictions' in predictions:
            img = draw_bounding_boxes(img, predictions)

        _, buffer = cv2.imencode('.jpg', img)
        jpg_as_text = base64.b64encode(buffer).decode('utf-8')

        socketio.emit('frame', {'image': jpg_as_text})

        socketio.sleep(0.2)

DIST_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'dist')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    if path and os.path.exists(os.path.join(DIST_DIR, path)):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, 'index.html')

@socketio.on('start_capture')
def handle_start_capture():
    log.info('Starting screen capture')
    socketio.start_background_task(capture_and_process_screen)

@socketio.on('stop_capture')
def handle_stop_capture():
    global capturing
    capturing = False
    log.info('Screen capture stopped')

if __name__ == '__main__':
    capturing = False
    log.info('CardioScan backend starting on http://0.0.0.0:6767')
    socketio.run(app, host='0.0.0.0', port=6767)
