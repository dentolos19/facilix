set dotenv-load

setup: install
    just migrate

install:
    cd src/app && bun install --frozen-lockfile
    cd src/server && uv sync --frozen
    cd src/simulator && uv sync --frozen

start:
    cd src/app && bun run dev

build:
    cd src/app && bun run build

check:
    cd src/app && bun run check
    cd src/server && uv run ruff check --fix && uv run ruff format && uv run ty check
    cd src/simulator && uv run ruff check --fix && uv run ruff format && uv run ty check

migrate *args:
    cd src/app && bun run db:migrate {{ args }}

deploy: install build
    #!/usr/bin/env bash
    set -euo pipefail
    cd src/app
    names=(
        BETTER_AUTH_SECRET
        BETTER_AUTH_URL
        OPENROUTER_API_KEY
        OPENROUTER_MODEL
        OPENROUTER_REFERER
        OPENROUTER_TITLE
        ROBOFLOW_API_KEY
    )
    for name in "${names[@]}"; do if [[ -z "${!name:-}" ]]; then echo "Missing worker secret value: $name" >&2; exit 1; fi; done
    node -e 'process.stdout.write(JSON.stringify(Object.fromEntries(process.argv.slice(1).map((name) => [name, process.env[name]]))))' "${names[@]}" | bun wrangler secret bulk
    bun wrangler deploy
