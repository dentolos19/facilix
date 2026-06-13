.PHONY: dev start simulate desimulate check

setup:
	cd src/app && bun install
	cd src/server && uv sync
	cd src/simulator && uv sync

start:
	cd src/app && bun run dev

migrate:
	cd src/app && bun run db:migrate

simulate:
	docker compose up --detach --build

desimulate:
	docker compose down

check:
	cd src/app && bun run check
	cd src/server && uv run ruff check --fix
	cd src/server && uv run ruff format
	cd src/simulator && uv run ruff check --fix
	cd src/simulator && uv run ruff format
