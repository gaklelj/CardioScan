# ─── Python backend ───────────────────────────────────────────────────────────
FROM python:3.11-slim

# Системные зависимости для TensorFlow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python зависимости
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Бэкенд
COPY backend/ ./backend/


EXPOSE 6767
WORKDIR /app/backend
CMD ["python", "app.py"]
