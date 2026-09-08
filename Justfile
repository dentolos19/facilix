setup:
    cd src/app && bun install
    cd src/server && uv sync
    cd src/simulator && uv sync
    just migrate

start:
    cd src/app && bun run dev

check:
    cd src/app && bun run check
    cd src/server && uv run ruff check --fix && uv run ruff format && uv run ty check
    cd src/simulator && uv run ruff check --fix && uv run ruff format && uv run ty check

migrate *args:
    cd src/app && bun run db:migrate {{ args }}
