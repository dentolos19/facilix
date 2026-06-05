.PHONY: dev check

setup:
	cd src/app && bun install
	cd src/server && uv sync

start:
	docker compose up --build --detach

stop:
	docker compose down

check:
	cd src/app && bun run check
	cd src/server && uv run ruff check --fix
	cd src/server && uv run ruff format
