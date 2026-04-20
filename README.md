# Local Services

A small Vite + React app for listing local services and their ports.

The home page shows:

- service name
- port
- `localhost` URL
- LAN IPv4 URL when enabled

The settings page is password protected and lets you manage the list manually.

## Usage

Install dependencies:

```bash
pnpm install
```

Run in development:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
```

Run with Docker:

```bash
cp .env.example .env
docker compose up -d --build
```

Docker environment options:

```text
ENABLE_HTTPS=false
TLS_CERT_DIR=/path/to/certs
TLS_CERT_FILE=mycert.pem
TLS_KEY_FILE=mycert-key.pem
```

If `ENABLE_HTTPS=false`, the container serves HTTP only on port `80`.

If `ENABLE_HTTPS=true`, the container also enables HTTPS and loads the certificate files from `TLS_CERT_DIR`.
