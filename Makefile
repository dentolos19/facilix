.PHONY: setup start check migrate simulate desimulate resimulate

setup:
	cd src/app && bun install
	cd src/server && uv sync
	cd src/simulator && uv sync

start:
	cd src/app && bun run dev

check:
	cd src/app && bun run check
	cd src/server && uv run ruff check --fix && uv run ruff format && uv run ty check
	cd src/simulator && uv run ruff check --fix && uv run ruff format && uv run ty check

migrate:
	cd src/app && bun run db:migrate
