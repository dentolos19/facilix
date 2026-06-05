# ---------------------------------------------------------------------------
# IoT Sensor Simulator — Python container (uv-based)
# ---------------------------------------------------------------------------
FROM python:3.12-slim

# Install curl (for healthcheck) and uv (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .
RUN uv sync --no-dev

COPY . .

EXPOSE 8010

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010"]
