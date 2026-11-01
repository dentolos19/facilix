set dotenv-load
set dotenv-filename := dotenv_path
set dotenv-override

environment := ""
dotenv_file := if environment == "" { ".env" } else { ".env." + environment }
dotenv_path := "src/app/" + dotenv_file

setup: install
    just environment={{ quote(environment) }} migrate

install:
    cd src/app && bun install --frozen-lockfile
    cd src/server && uv sync --frozen
    cd src/simulator && uv sync --frozen

start:
    cd src/app && bun run dev

build:
    cd src/app && bun run build

check:
    cd src/app && bun lint --fix && bun fmt && bun check --no-script
    cd src/server && uv run ruff check --fix && uv run ruff format && uv run ty check
    cd src/simulator && uv run ruff check --fix && uv run ruff format && uv run ty check

migrate *args:
    cd src/app && bun run db:migrate {{ args }}

deploy: install build
    #!/usr/bin/env bash
    set -euo pipefail
    secrets=(
        BETTER_AUTH_SECRET
        BETTER_AUTH_URL
        OPENROUTER_API_KEY
        OPENROUTER_MODEL
        OPENROUTER_REFERER
        OPENROUTER_TITLE
        ROBOFLOW_API_KEY
    )
    for secret in "${secrets[@]}"; do if [[ -z "${!secret:-}" ]]; then echo "Missing secret value: $secret" >&2; exit 1; fi; done
    test -f {{ quote(dotenv_path) }}
    just environment={{ quote(environment) }} migrate --remote
    cd src/app
    bun run deploy --prebuilt --secrets-file {{ quote(dotenv_file) }}
