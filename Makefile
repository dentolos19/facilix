.PHONY: dev check

setup:
	bun install
	cd services/monitor && uv sync

start:
	docker compose up --build --detach

stop:
	docker compose down

check:
	bun run check
	cd services/monitor && uv run ruff check --fix
	cd services/monitor && uv run ruff format
