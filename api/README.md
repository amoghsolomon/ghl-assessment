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
GHL_VERSION_ID=your-marketplace-app-version-id
GHL_APP_SHARED_SECRET=your-marketplace-shared-secret
APP_SESSION_SECRET=random-local-session-signing-secret
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openrouter-model-id
```

The copilot analysis pipeline uses the Vercel AI SDK with OpenRouter. Optional env vars are
`OPENROUTER_BASE_URL`, `COPILOT_DB_PATH`, `WEBHOOK_SIGNATURE_PUBLIC_KEY`, and `WEBHOOK_PUBLIC_KEY`.

Build the web component first if you want to load `/embed`:

```sh
pnpm --dir ../web-component build
pnpm dev
```

Then open `http://localhost:3000/embed`.
