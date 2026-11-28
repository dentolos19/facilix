# Agent Instructions

Facilix is a smart facility monitoring and operations platform for a food factory, combining a facility map editor, CCTV intelligence plugins, sensor monitoring, and incident alerts in one dashboard. It runs as a Cloudflare Worker with Python containers for monitoring and simulation.

## Commands

- `just setup`: Install all dependencies and apply local D1 migrations.
- `just install`: Install dependencies for the app with Bun and for the server and simulator with uv.
- `just start`: Run the app development server with the `cf` CLI.
- `just build`: Build the app and its containers.
- `just check`: Lint, format, and type check the app with Bun, and the server and simulator with Ruff and ty.
- `just test`: Run the app tests with Bun and the server tests with `unittest`.
- `just migrate`: Apply D1 migrations locally, or remotely with `--remote`.
- `just deploy`: Build, migrate the remote D1 database, and deploy the Worker with `src/app/.env` as its secrets. Set `environment=production` to use `src/app/.env.production`.

## Stack

TanStack Start on Cloudflare Workers with D1 (Drizzle ORM), R2, Workflows, Durable Objects, and Containers, plus Better Auth, OpenRouter, and Roboflow in [`src/app`](src/app); a FastAPI monitoring service in [`src/server`](src/server); and a FastAPI CCTV and sensor simulator in [`src/simulator`](src/simulator).

## Rules

- Run every command from the repository root; the `Justfile` changes into each project.
- Define the database schema in [`src/app/src/lib/database/schema.ts`](src/app/src/lib/database/schema.ts) and generate migrations into `src/app/migrations/` with `bun run db:generate`.
- Declare Worker bindings, secrets, and containers in [`src/app/cloudflare.config.ts`](src/app/cloudflare.config.ts), and list each secret in `src/app/.env.template`.

## Documentation

- [Product Specifications](PRODUCT.md)
- [Design System](DESIGN.md)
- [Documentation Guidelines](docs/README.md)
- [Cloudflare Development](docs/guides/cloudflare.md)
