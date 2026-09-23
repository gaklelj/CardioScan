"""
Тесты API CardioScan
Запуск: python test_api.py [BASE_URL]
"""
import sys
import io
import random
import requests
from PIL import Image, ImageDraw

BASE_URL = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:6767'
TIMEOUT = 180

OK = '\033[92m✓\033[0m'
FAIL = '\033[91m✗\033[0m'

def check(name, passed, detail=''):
    icon = OK if passed else FAIL
    print(f'  {icon} {name}' + (f'  →  {detail}' if detail else ''))
    return passed

def make_ecg_image() -> bytes:
    """Генерирует простое тестовое изображение ЭКГ."""
    img = Image.new('RGB', (640, 480), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    points = [(x, 240 + int(100 * __import__('math').sin(x / 20))) for x in range(640)]
    draw.line(points, fill=(0, 0, 0), width=2)
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    return buf.getvalue()

def test_health():
    print('\n[1] Health check')
    r = requests.get(f'{BASE_URL}/api/health', timeout=10)
    data = r.json()
    check('HTTP 200', r.status_code == 200, r.status_code)
    check('status ok', data.get('status') == 'ok', data.get('status'))
    check('model name', 'model' in data, data.get('model'))

def test_ecg_image_json():
    print('\n[2] POST /api/ecg/analyze  (изображение → JSON, YOLO)')
    img_bytes = make_ecg_image()
    r = requests.post(
        f'{BASE_URL}/api/ecg/analyze',
        files={'file': ('ecg.jpg', img_bytes, 'image/jpeg')},
        timeout=TIMEOUT,
    )
    data = r.json()
    check('HTTP 200', r.status_code == 200, r.status_code)
    check('predictions present', 'predictions' in data, type(data.get('predictions')))
    check('image size present', 'image' in data, data.get('image'))

def test_ecg_image_annotated():
    print('\n[3] POST /api/ecg/analyze  (изображение → аннотированное фото)')
    img_bytes = make_ecg_image()
    r = requests.post(
        f'{BASE_URL}/api/ecg/analyze?format=image',
        files={'file': ('ecg.jpg', img_bytes, 'image/jpeg')},
        timeout=TIMEOUT,
    )
    check('HTTP 200', r.status_code == 200, r.status_code)
    check('content-type image', r.headers.get('Content-Type', '').startswith('image/'), r.headers.get('Content-Type'))
    check('has body', len(r.content) > 0, f'{len(r.content)} bytes')

def test_ecg_empty():
    print('\n[4] POST /api/ecg/analyze  (пустое тело — ожидаем 400)')
    r = requests.post(f'{BASE_URL}/api/ecg/analyze', json={}, timeout=10)
    check('HTTP 400', r.status_code == 400, r.status_code)

def test_ecg_points_no_keras():
    print('\n[5] POST /api/ecg/analyze  (points без Keras — ожидаем 500)')
    points = [random.uniform(-1, 1) for _ in range(250)]
    r = requests.post(f'{BASE_URL}/api/ecg/analyze', json={'points': points}, timeout=TIMEOUT)
    data = r.json()
    check('non-200 (модель недоступна)', r.status_code != 200, r.status_code)
    check('error message', 'error' in data, data.get('error'))

if __name__ == '__main__':
    print(f'Target: {BASE_URL}')
    try:
        test_health()
        test_ecg_image_json()
        test_ecg_image_annotated()
        test_ecg_empty()
        test_ecg_points_no_keras()
        print('\nDone.\n')
    except (requests.exceptions.ConnectionError, requests.exceptions.ReadTimeout) as e:
        print(f'\n{FAIL} {type(e).__name__}: {e}')
