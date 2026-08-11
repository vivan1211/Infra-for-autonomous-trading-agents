FROM python:3.12-slim

WORKDIR /app

# Install Doppler CLI for secrets management (fetches secrets at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends apt-transport-https ca-certificates curl gnupg \
    && curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" > /etc/apt/sources.list.d/doppler-cli.list \
    && apt-get update && apt-get install -y doppler \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .

# apscheduler is already in pyproject.toml dependencies
RUN pip install --no-cache-dir .

COPY . .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# No port exposed — this is a background worker, not an HTTP service.

# If DOPPLER_TOKEN is set, use Doppler to inject secrets; otherwise use env vars directly
CMD ["sh", "-c", "if [ -n \"$DOPPLER_TOKEN\" ]; then exec doppler run -- python -m app.services.wiki_scheduler; else exec python -m app.services.wiki_scheduler; fi"]
