# Cloudflare Development

The app uses the beta `cf` CLI and Cloudflare Vite plugin with [`src/app/cloudflare.config.ts`](../../src/app/cloudflare.config.ts). The server and simulator run as Cloudflare Containers built from their Dockerfiles.

## Local State

`just migrate` applies D1 migrations locally. Local D1, R2, Workflow, and Durable Object state remains in `src/app/.wrangler/state` so existing development data stays available.

## Deployment

`just deploy` builds the app and containers, migrates the remote D1 database, then deploys the Worker with `src/app/.env` uploaded as Worker secrets. It stops if the migration fails. Set `environment=production` to use `src/app/.env.production` instead; the selector changes the secrets file, not the `cf` mode or deployment target.

Keep `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the process environment, outside the secrets file. CI writes `src/app/.env` from the Production environment before deploying.

## Existing Resources

The configuration retains the existing R2 bucket, Workflow, Durable Objects, container names, and D1 database. After a deployment adopts declarative Durable Object exports, Cloudflare does not permit returning to the legacy migration-array configuration.
