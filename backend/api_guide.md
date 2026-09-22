# CardioScan API Guide

Base URL: `http://<host>:6767`

---

## REST

### GET /api/health

Проверка состояния сервера.

**Response 200**
```json
{
  "status": "ok",
  "model": "best_ecg_model.h5"
}
```

---

### POST /api/ecg/analyze

Анализ ЭКГ. Поддерживает три формата входа.

---

#### Вариант 1 — сырые точки (локальная модель)

**Request** `Content-Type: application/json`
```json
{
  "points": [0.1, 0.4, 0.9, 0.7, 0.3]
}
```

- `points` — массив float, любая длина (модель ожидает 1000 точек; если меньше — дополняется, если больше — обрезается)

**Response 200**
```json
{
  "class": "Normal",
  "confidence": 0.9321,
  "all": {
    "Normal": 0.9321,
    "Atrial Fibrillation": 0.0312,
    "Other": 0.0198,
    "Noise": 0.0087,
    "ST-elevation": 0.0054,
    "ST-depression": 0.0028
  }
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `class` | string | Предсказанный класс |
| `confidence` | float 0–1 | Уверенность модели |
| `all` | object | Вероятности по всем 6 классам |

Возможные значения `class`:
- `Normal`
- `Atrial Fibrillation`
- `Other`
- `Noise`
- `ST-elevation`
- `ST-depression`

---

#### Вариант 2 — изображение ЭКГ через multipart (Roboflow)

**Request** `Content-Type: multipart/form-data`
```
file=<бинарный файл изображения>
```

---

#### Вариант 3 — изображение ЭКГ через base64 (Roboflow)

**Request** `Content-Type: application/json`
```json
{
  "image": "<base64-encoded image>"
}
```

**Response 200** (варианты 2 и 3) — стандартный ответ Roboflow:
```json
{
  "predictions": [
    {
      "x": 320,
      "y": 240,
      "width": 100,
      "height": 50,
      "confidence": 0.87,
      "class": "ST-elevation"
    }
  ],
  "image": { "width": 640, "height": 480 }
}
```

---

#### Ошибки

| Код | Причина |
|-----|---------|
| 400 | Не передан ни `points`, ни `file`, ни `image` |
| 503 | Roboflow недоступен |
| 500 | Внутренняя ошибка сервера |

```json
{ "error": "описание ошибки" }
```

---

## WebSocket

Подключение: `ws://<host>:6767`
Протокол: Socket.IO

---

### Событие: `ecg_data` (клиент → сервер)

Передача одной точки в реальном времени (стриминг с датчика).

```json
{
  "value": 0.52,
  "timestamp": 1710672000000
}
```

- Сервер накапливает буфер из **1000 точек**
- При заполнении буфера автоматически запускает анализ и сбрасывает буфер

**Сервер эмитит в ответ:**

| Событие | Когда | Данные |
|---------|-------|--------|
| `ecg_point` | на каждую точку | `{ "value": float, "timestamp": int }` |
| `ecg_analysis` | каждые 1000 точек | см. формат ответа модели выше |

---

### Событие: `ecg_batch` (клиент → сервер)

Передача пакета точек (оффлайн, например с ESP32).

```json
{
  "points": [0.1, 0.4, 0.9, 0.7, ...]
}
```

**Сервер эмитит в ответ:**

| Событие | Данные |
|---------|--------|
| `ecg_batch` | эхо переданного пакета |
| `ecg_analysis` | результат анализа |
| `ecg_error` | `{ "error": "..." }` — если анализ упал |

---

## Примеры

### curl — сырые точки
```bash
curl -X POST http://localhost:6767/api/ecg/analyze \
  -H "Content-Type: application/json" \
  -d '{"points": [0.1, 0.5, 0.9, 0.4, 0.2]}'
```

### curl — изображение
```bash
curl -X POST http://localhost:6767/api/ecg/analyze \
  -F "file=@ecg_image.png"
```

### JavaScript — WebSocket стриминг
```js
const socket = io('http://localhost:6767')

// Отправка точки
socket.emit('ecg_data', { value: 0.52, timestamp: Date.now() })

// Получение результата анализа
socket.on('ecg_analysis', (result) => {
  console.log(result.class, result.confidence)
})
```

### Python — пакетный анализ
```python
import socketio

sio = socketio.Client()
sio.connect('http://localhost:6767')

sio.emit('ecg_batch', {'points': [0.1, 0.5, 0.9] * 333 + [0.1]})

@sio.on('ecg_analysis')
def on_result(data):
    print(data['class'], data['confidence'])
```
