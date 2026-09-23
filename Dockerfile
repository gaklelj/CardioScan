# ─── Python backend ───────────────────────────────────────────────────────────
FROM python:3.11-slim

# Системные зависимости для TensorFlow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Torch CPU-only (до ultralytics, чтобы не тянуло CUDA ~3 ГБ)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Python зависимости
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Бэкенд
COPY backend/ ./backend/


EXPOSE 6767
WORKDIR /app/backend
CMD ["python", "app.py"]
