FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.7.20 /uv /uvx /bin/
COPY --from=bluenviron/mediamtx:1.11.3 /mediamtx /usr/local/bin/mediamtx

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -u 5678 --create-home --shell /bin/bash app

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY . .

RUN mkdir -p /app/hls && chmod +x /app/start.sh && chown -R app:app /app /app/samples

USER app

EXPOSE 8000

CMD ["sh", "/app/start.sh"]
