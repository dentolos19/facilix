.PHONY: setup services services-build services-start services-stop services-logs
.PHONY: services-cctv services-cctv-build services-cctv-start services-cctv-stop services-cctv-logs
.PHONY: services-sensors services-sensors-build services-sensors-start services-sensors-stop services-sensors-logs

setup:
	bun install
	cd services/cctv && uv sync
	cd services/sensors && uv sync

services:
	docker compose up --build
