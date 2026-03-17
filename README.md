# ots-cvm

ContextVM server for creating and verifying OpenTimestamps-backed NIP-03 attestations for Nostr events.

Verification uses a public Bitcoin JSON-RPC API and does not require running a local Bitcoin node.

## Run

Local development:

```bash
bun install
bun run dev
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
- `OTS_VERIFY_CACHE_DIR`: directory used by Python verification upgrades to cache calendar responses
- `OTS_CALENDARS`: comma-separated OpenTimestamps calendar URLs
- `OTS_PYTHON_BIN`: optional Python executable override for local host development only

## Docker runtime

Docker bundles Bun, Python, and the OpenTimestamps dependencies. No extra Python setup is needed on the host.

```bash
docker compose up --build
```

The container persists runtime data in [`data/`](data/) and exposes logs through `docker compose logs`.

For Docker deployments, you normally do not need to set [`OTS_PYTHON_BIN`](src/config.ts:33).
