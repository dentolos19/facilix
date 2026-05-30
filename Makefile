.PHONY: setup services services-build services-start services-stop services-logs
.PHONY: services-cctv services-cctv-build services-cctv-start services-cctv-stop services-cctv-logs
.PHONY: services-sensors services-sensors-build services-sensors-start services-sensors-stop services-sensors-logs

setup:
	bun install
	cd services/cctv && uv sync
	cd services/sensors && uv sync

# ── All services ────────────────────────────────────────────────────────────

services:
	docker compose up --build

services-build:
	docker compose build

services-start:
	docker compose up -d

services-stop:
	docker compose stop

services-logs:
	docker compose logs -f

# ── CCTV simulator ─────────────────────────────────────────────────────────

services-cctv:
	docker compose up --build mediamtx cctv

services-cctv-build:
	docker compose build mediamtx cctv

services-cctv-start:
	docker compose up -d mediamtx cctv

services-cctv-stop:
	docker compose stop mediamtx cctv

services-cctv-logs:
	docker compose logs -f mediamtx cctv

# ── Sensor simulator ───────────────────────────────────────────────────────

services-sensors:
	docker compose up sensors

services-sensors-build:
	docker compose build sensors

services-sensors-start:
	docker compose up -d sensors

services-sensors-stop:
	docker compose stop sensors

services-sensors-logs:
	docker compose logs -f sensors
