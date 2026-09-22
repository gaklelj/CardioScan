# ─── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:20-alpine AS frontend

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --silent

COPY frontend/ ./
# package.json скрипт уже задаёт BUILD_PATH=../static/dist (→ /build/static/dist)
RUN npm run build

# ─── Stage 2: Python backend ──────────────────────────────────────────────────
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

# Собранный фронтенд (Flask отдаёт его из ../static/dist)
COPY --from=frontend /build/static/dist ./static/dist

EXPOSE 6767
WORKDIR /app/backend
CMD ["python", "app.py"]
