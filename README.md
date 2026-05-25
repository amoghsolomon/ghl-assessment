# Voice AI Observability Copilot

Monorepo for a HighLevel Voice AI observability prototype.

## Apps

- `api`: Hono backend running on Node.js.
- `web-component`: Vue/Vite app compiled as the `observability-copilot` custom element.

## Local Setup

```sh
pnpm install
pnpm build
pnpm dev:api
```

Open `http://localhost:3000/embed` to verify the compiled web component served by Hono.

## Environment

The API uses Node 24's built-in env-file loading. Put these in either the repo root `.env` or `api/.env`:

```sh
GHL_CLIENT_ID=your-client-id
GHL_CLIENT_SECRET=your-client-secret
GHL_OAUTH_SCOPES=your marketplace app scopes
GHL_APP_ID=your-marketplace-app-id
GHL_APP_SHARED_SECRET=your-marketplace-shared-secret
APP_SESSION_SECRET=random-local-session-signing-secret
APP_ORIGIN=http://localhost:3000
GHL_SESSION_DB_PATH=./data/ghl-sessions.sqlite
```

`APP_ORIGIN` and `GHL_SESSION_DB_PATH` are optional. If no app origin is supplied, the API derives `/oauth/callback` from the request origin. `GHL_APP_SHARED_SECRET` is used only on the backend to decrypt HighLevel user context. `APP_SESSION_SECRET` signs the short-lived app session token used between the web component and API.

## Served Endpoints

- `GET /health`: backend health check.
- `GET /oauth/install`: starts the HighLevel OAuth install flow.
- `GET /oauth/callback`: exchanges the OAuth code and stores the returned session in SQLite.
- `GET /api/ghl/sessions`: lists stored HighLevel sessions without token values.
- `POST /api/auth/ghl-context`: accepts encrypted HighLevel user context and returns a short-lived app session token.
- `GET /api/voice-ai/call-logs`: protected Voice AI call-log proxy using the verified active HighLevel location.
- `GET /api/copilot/summary`: mock observability summary used by the component.
- `GET /widget/observability-copilot.js`: compiled Vue custom element bundle.
- `GET /embed`: local page that loads the compiled custom element from Hono.

## HighLevel Injection Shape

The intended Custom JS integration should inject only a tab button and mount node:

```html
<script type="module" src="https://your-api-host/widget/observability-copilot.js"></script>
<observability-copilot
  api-base-url="https://your-api-host"
  app-id="your-marketplace-app-id"
  agent-id="optional-agent-id"
></observability-copilot>
```
