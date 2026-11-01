# Cloudflare development

The app uses the beta `cf` CLI and Cloudflare Vite plugin with `src/app/cloudflare.config.ts`.
Run `just setup`, `just start`, and `just check` from the repository root. Bun handles the
frontend, and uv handles the Python server and simulator.

`just migrate` applies D1 migrations locally. Local D1, R2, workflow, and Durable Object
state remains in `src/app/.wrangler/state` so existing development data stays available.
`just migrate --remote` targets the existing Facilix D1 database; `just deploy` runs it before uploading the Worker and stops if migration fails.

`just deploy` builds the app and containers, migrates remote D1, then deploys using `src/app/.env`. Use
`just environment=production deploy` to select `src/app/.env.production`. The chosen
file takes precedence over inherited variables and is uploaded as Worker secrets. Keep
Cloudflare API credentials in the process environment, outside that file. CI creates
the app's `.env` from the Production environment before deploying.
The selector changes the environment file, not the cf mode or deployment target.

The configuration retains the existing R2 bucket, Workflow, Durable Objects, container
names, and D1 database. After a deployment adopts declarative Durable Object exports,
Cloudflare does not permit returning to the legacy migration-array configuration.
