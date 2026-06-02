.PHONY: dev check

setup:
	bun install
	cd services/monitoring && uv sync

start:
	docker compose up --build --detach

stop:
	docker compose down

check:
	bun run check
	cd services/monitoring && uv run ruff check --fix
	cd services/monitoring && uv run ruff format
