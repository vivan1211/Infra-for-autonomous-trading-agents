FROM python:3.12-slim

WORKDIR /app

# Install Doppler CLI for secrets management + git for bot dependencies
RUN apt-get update && apt-get install -y --no-install-recommends git apt-transport-https ca-certificates curl gnupg \
    && curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" > /etc/apt/sources.list.d/doppler-cli.list \
    && apt-get update && apt-get install -y doppler \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Worker-specific dependencies (rarely changes — cached)
RUN pip install --no-cache-dir arq httpx redis

# Copy ALL bot requirements first for dep caching (deps change less often than code)
COPY bots/polymarket-v2/requirements.txt ./bots/polymarket-v2/requirements.txt
COPY bots/kalshi-v2/requirements.txt ./bots/kalshi-v2/requirements.txt
COPY bots/superforecaster-kalshi/requirements.txt ./bots/superforecaster-kalshi/requirements.txt
COPY bots/superforecaster-poly/requirements.txt ./bots/superforecaster-poly/requirements.txt
RUN pip install --no-cache-dir \
    -r bots/polymarket-v2/requirements.txt \
    -r bots/kalshi-v2/requirements.txt \
    -r bots/superforecaster-kalshi/requirements.txt \
    -r bots/superforecaster-poly/requirements.txt

# Copy worker entry point + backend app package (for encryption/credentials helpers)
COPY backend/worker.py ./backend/worker.py
COPY backend/app/ ./backend/app/
COPY backend/polymarket/ ./polymarket/

# Install backend dependencies needed by the app package (encryption, config)
COPY backend/pyproject.toml ./backend/pyproject.toml
RUN pip install --no-cache-dir pydantic-settings cryptography PyJWT

# Copy bot code LAST — changes most often, must not be cached stale
COPY bots/ ./bots/

# Run as non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# If DOPPLER_TOKEN is set, use Doppler to inject secrets; otherwise use env vars directly
CMD ["sh", "-c", "if [ -n \"$DOPPLER_TOKEN\" ]; then exec doppler run -- arq backend.worker.WorkerSettings; else exec arq backend.worker.WorkerSettings; fi"]
