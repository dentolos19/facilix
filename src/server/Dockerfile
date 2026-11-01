FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /uvx /bin/

# Install system dependencies for video processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .
COPY uv.lock .
RUN uv sync --no-dev --frozen

COPY . .

RUN adduser -u 5678 --disabled-password --gecos "" app && chown -R app /app
USER app

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 3000

CMD ["uvicorn", "--app-dir", "/app/src", "main:app", "--host", "0.0.0.0", "--port", "3000"]
