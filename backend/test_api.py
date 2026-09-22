"""
Тесты API CardioScan
Запуск: python test_api.py [BASE_URL]
"""
import sys
import json
import random
import requests

BASE_URL = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:6767'

OK = '\033[92m✓\033[0m'
FAIL = '\033[91m✗\033[0m'

def check(name, passed, detail=''):
    icon = OK if passed else FAIL
    print(f'  {icon} {name}' + (f'  →  {detail}' if detail else ''))
    return passed

def test_health():
    print('\n[1] Health check')
    r = requests.get(f'{BASE_URL}/api/health', timeout=10)
    data = r.json()
    check('HTTP 200', r.status_code == 200, r.status_code)
    check('status ok', data.get('status') == 'ok', data.get('status'))
    check('model name', 'model' in data, data.get('model'))

def test_ecg_points():
    print('\n[2] POST /api/ecg/analyze  (points — локальная модель)')
    points = [random.uniform(-1, 1) for _ in range(250)]
    r = requests.post(
        f'{BASE_URL}/api/ecg/analyze',
        json={'points': points},
        timeout=30,
    )
    data = r.json()
    check('HTTP 200', r.status_code == 200, r.status_code)
    check('class present', 'class' in data, data.get('class'))
    check('confidence 0–1', 0 <= data.get('confidence', -1) <= 1, data.get('confidence'))
    check('all classes', 'all' in data, list(data.get('all', {}).keys()))

def test_ecg_empty():
    print('\n[3] POST /api/ecg/analyze  (пустое тело — ожидаем 400)')
    r = requests.post(f'{BASE_URL}/api/ecg/analyze', json={}, timeout=10)
    check('HTTP 400', r.status_code == 400, r.status_code)

def test_ecg_short_signal():
    print('\n[4] POST /api/ecg/analyze  (короткий сигнал — padding)')
    r = requests.post(
        f'{BASE_URL}/api/ecg/analyze',
        json={'points': [0.1, 0.5, 0.9]},
        timeout=30,
    )
    check('HTTP 200', r.status_code == 200, r.status_code)
    check('class present', 'class' in r.json())

if __name__ == '__main__':
    print(f'Target: {BASE_URL}')
    try:
        test_health()
        test_ecg_points()
        test_ecg_empty()
        test_ecg_short_signal()
        print('\nDone.\n')
    except requests.exceptions.ConnectionError:
        print(f'\n{FAIL} Не удалось подключиться к {BASE_URL}')
