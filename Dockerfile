FROM python:3.12-slim

WORKDIR /app

# Install backend dependencies
COPY backend/pyproject.toml .
RUN pip install --no-cache-dir .

# Install additional backend deps
RUN pip install --no-cache-dir \
    py-clob-client-v2==1.0.1 \
    aiosqlite==0.19.0 \
    aiohttp>=3.11.0 \
    requests>=2.32.0 \
    pandas>=2.0.0 \
    numpy>=1.24.0 \
    scipy>=1.12.0 \
    python-dotenv==1.0.0 \
    structlog==23.2.0 \
    xai_sdk>=1.0.0 \
    json-repair \
    feedparser>=6.0.0 \
    ratelimit==2.2.1 \
    pycryptodome==3.20.0 \
    python-dateutil==2.8.2 \
    pytz==2023.3 \
    pyyaml==6.0.1

# Copy backend code
COPY backend/ .

# Copy bot code LAST — changes most often, must not be cached stale
COPY bots/ /app/bots/

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
