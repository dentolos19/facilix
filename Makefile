.PHONY: setup services-sensors services-sensors-build services-sensors-start services-sensors-stop services-sensors-logs

setup:
	bun install
	cd tests && uv sync

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
