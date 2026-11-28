set dotenv-load
set dotenv-filename := dotenv_file
set dotenv-override

environment := ""
dotenv_file := if environment == "" { ".env" } else { ".env." + environment }

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

test:
    cd src/app && bun test
    cd src/server && uv run python -m unittest discover -s tests

migrate *args:
    cd src/app && bun run db:migrate {{ args }}

deploy: install build
    #!/usr/bin/env bash
    set -euo pipefail
    cd src/app
    test -f {{ quote(dotenv_file) }}
    just environment={{ quote(environment) }} migrate --remote
    bun run deploy --prebuilt --secrets-file {{ quote(dotenv_file) }}
