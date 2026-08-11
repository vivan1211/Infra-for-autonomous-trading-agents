FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY bots/kalshi-v2/ /app/bots/kalshi-v2/

RUN pip install --no-cache-dir -r /app/bots/kalshi-v2/requirements.txt

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

WORKDIR /app/bots/kalshi-v2
CMD ["python", "-u", "agent_fund_patch.py"]
