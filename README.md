# ots-cvm

ContextVM server for creating and verifying OpenTimestamps-backed NIP-03 attestations for Nostr events.

Verification uses a public Bitcoin JSON-RPC API and does not require running a local Bitcoin node.

## Run

Local development:

```bash
bun install
bun run dev
```

Easy deployment with the published image:

```bash
docker pull ghcr.io/contextvm-org/ots-cvm:latest
docker run --rm --env-file .env -v ./data:/app/data ghcr.io/contextvm-org/ots-cvm:latest
```

Docker:

```bash
docker compose up --build
```

## Environment

Main environment variables:

- `SERVER_PRIVATE_KEY`: hex-encoded Nostr secret key used by the server
- `RELAYS`: comma-separated relay URLs for fetch and publish operations
- `ATTESTATION_RELAYS`: comma-separated relay URLs used specifically to publish NIP-03 attestation events
- `BITCOIN_API_URL`: Bitcoin JSON-RPC endpoint used by verification
- `LOG_LEVEL`: `info` or `debug`

Optional environment variables:

- `SQLITE_PATH`: SQLite database file path
- `OTS_DATA_DIR`: directory used for cached proof files
- `OTS_PROOF_TTL_DAYS`: retention window for proof artifacts written to [`OTS_DATA_DIR`](src/config.ts:33) (default: 30)
- `OTS_VERIFY_CACHE_DIR`: directory used by Python verification upgrades to cache calendar responses
- `OTS_VERIFY_CACHE_TTL_DAYS`: retention window for verification cache files (default: 3)
- `CLEANUP_INTERVAL_MINUTES`: how often expired filesystem artifacts are removed (default: 1440, once per day)
- `OTS_CALENDARS`: comma-separated OpenTimestamps calendar URLs
- `OTS_PYTHON_BIN`: optional Python executable override for local host development only

Create a local [`.env`](.env) file before starting the service:

```bash
cp .env.example .env
```

Then edit [`.env`](.env) and set at least `SERVER_PRIVATE_KEY`.

Notes:

- [`SERVER_PRIVATE_KEY`](src/config.ts:41) is the only variable you should treat as required for production.
- [`RELAYS`](src/config.ts:51), [`ATTESTATION_RELAYS`](src/config.ts:52), [`BITCOIN_API_URL`](src/config.ts:62), and [`LOG_LEVEL`](src/config.ts:63) are optional because the app has defaults.
- [`.env.example`](.env.example) contains the minimal starter template for local and Docker usage.
- [`docker-compose.yml`](docker-compose.yml) already loads values from [`.env`](.env) via `env_file`, so Docker deployments only need that file present next to the compose file.
- Proof and verification cache files are cleaned up automatically on startup and periodically afterwards using the configured TTL values.

## Docker runtime

Docker bundles Bun, Python, and the OpenTimestamps dependencies. No extra Python setup is needed on the host.

```bash
docker compose up --build
```

To run the published image directly, pass the same variables with `--env-file`:

```bash
docker run --rm \
  --env-file .env \
  -v ./data:/app/data \
  ghcr.io/contextvm-org/ots-cvm:latest
```

The container persists runtime data in [`data/`](data/) and exposes logs through `docker compose logs`.

For Docker deployments, you normally do not need to set [`OTS_PYTHON_BIN`](src/config.ts:33).
