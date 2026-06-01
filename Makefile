.PHONY: dev check

setup:
	bun install
	cd services/monitor && uv sync

dev:
	uv run main.py

check:
	cd services/monitor && uv run ruff check --fix
	cd services/monitor && uv run ruff format
