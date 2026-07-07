FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY --from=bluenviron/mediamtx:latest /mediamtx /usr/local/bin/mediamtx

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY src/simulator/pyproject.toml .
RUN uv sync --no-dev

COPY src/simulator/ .
COPY samples/ /samples/

RUN mkdir -p /app/hls && chmod +x /app/start.sh

EXPOSE 8000

CMD ["sh", "/app/start.sh"]
