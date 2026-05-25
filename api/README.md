# API

Hono backend for the Voice AI Observability Copilot.

```sh
pnpm install
pnpm dev
```

Required env vars can be placed in the repo root `.env` or `api/.env`:

```sh
GHL_CLIENT_ID=your-client-id
GHL_CLIENT_SECRET=your-client-secret
GHL_OAUTH_SCOPES=your marketplace app scopes
GHL_APP_SHARED_SECRET=your-marketplace-shared-secret
APP_SESSION_SECRET=random-local-session-signing-secret
```

Build the web component first if you want to load `/embed`:

```sh
pnpm --dir ../web-component build
pnpm dev
```

Then open `http://localhost:3000/embed`.
