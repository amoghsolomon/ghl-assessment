# Voice AI Observability Copilot

HighLevel Voice AI Observability Copilot is a marketplace-app prototype that adds an observability layer inside the HighLevel Voice AI dashboard. It ingests Voice AI call logs, runs AI-assisted call analysis, and turns transcripts/tool activity into health KPIs, per-call findings, tool correctness notes, and concrete recommendations for improving the agent configuration.

The goal is not to duplicate HighLevel's built-in call-log dashboard. This project focuses on the next step: helping an operator understand which calls need attention and which agent settings or prompts should be tuned.

## What It Does

- Embeds a Vue custom element into the HighLevel Voice AI area.
- Authenticates the embedded UI using HighLevel session context and a short-lived backend session token.
- Uses HighLevel OAuth sessions persisted in SQLite.
- Fetches Voice AI agents and call logs through the HighLevel SDK.
- Accepts `VoiceAiCallEnd` webhooks and queues analysis when calls finish.
- Reconciles missing analysis whenever call logs are loaded, so missed webhooks do not leave logs unprocessed.
- Uses the Vercel AI SDK with an OpenRouter model to produce structured call analysis.
- Computes dashboard KPIs from structured enum output, not free-form text.
- Shows per-call health, outcome, sentiment, findings, recommendations, and transcript/tool waterfall annotations.

## Dashboard KPIs

The dashboard renders five percentage-based KPIs from completed call analyses:

- **Success Rate**: calls where `outcome === "success"` divided by analyzed calls.
- **Completion Quality**: success counts as `1`, partial success counts as `0.5`, divided by analyzed calls.
- **Healthy Calls**: calls with health rating `1/3` divided by analyzed calls.
- **Positive Sentiment**: calls with `sentiment === "positive"` divided by analyzed calls.
- **Tool Accuracy**: observed tool calls minus tool calls flagged `incorrect` or `questionable`, divided by observed tool calls.

If a KPI has no valid denominator yet, the UI shows `-`.

## Architecture

```text
HighLevel UI
  -> Custom JS tab injection
  -> <observability-copilot> web component
  -> Hono API
  -> HighLevel SDK + SQLite OAuth sessions
  -> SQLite copilot queue/store
  -> Vercel AI SDK + OpenRouter
```

The analysis pipeline is intentionally simple for the prototype:

1. A `VoiceAiCallEnd` webhook stores the call payload and queues analysis.
2. Loading call logs also upserts logs and queues any missing analyses.
3. An in-process worker claims queued jobs from SQLite.
4. The worker fetches/enriches the call log and Voice AI agent configuration.
5. The AI analyzer receives the transcript, tool timeline, executed actions, deterministic evidence, and agent settings.
6. Structured output is persisted and returned with future call-log responses.

There is no cron or external queue in this version. SQLite stores durable state, and the API process drains queued jobs on startup, webhook receipt, and call-log reconciliation.

## Project Structure

```text
api/
  src/
    auth/                 HighLevel encrypted user context and app-session token helpers
    ghl/                  HighLevel SDK client and SQLite OAuth session storage
    copilot/              Analysis queue, SQLite store, webhook parsing, AI analyzer
    index.ts              Hono routes and endpoint wiring

web-component/
  src/
    ObservabilityCopilot.ce.vue       Custom element shell and data orchestration
    components/observability/         Dashboard cards, log list, drawer, timelines
    lib/                              Formatting and data helpers
    theme.ts                          Naive UI theme overrides
    types.ts                          Shared frontend contracts
    observability.css                 Custom element styles
```

## Requirements

- Node.js 24+
- pnpm
- HighLevel marketplace app credentials
- OpenRouter API key and model ID

## Environment

The API uses Node 24's built-in env-file loading. Put these in either the repo root `.env` or `api/.env`.

```sh
GHL_CLIENT_ID=your-client-id
GHL_CLIENT_SECRET=your-client-secret
GHL_OAUTH_SCOPES=voice-ai-dashboard.readonly voice-ai-agents.readonly voice-ai-agent-goals.readonly
GHL_VERSION_ID=your-marketplace-app-version-id
GHL_APP_ID=your-marketplace-app-id
GHL_APP_SHARED_SECRET=your-marketplace-shared-secret
APP_SESSION_SECRET=random-local-session-signing-secret

OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=your-openrouter-model-id
```

Optional:

```sh
APP_ORIGIN=https://your-public-api-origin
GHL_SESSION_DB_PATH=./data/ghl-sessions.sqlite
COPILOT_DB_PATH=./data/ghl-sessions.sqlite
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
WEBHOOK_SIGNATURE_PUBLIC_KEY=optional-ghl-ed25519-public-key
WEBHOOK_PUBLIC_KEY=optional-ghl-rsa-public-key
```

Notes:

- `APP_ORIGIN` is used to generate the OAuth callback URL. If omitted, the API derives the callback origin from the request.
- `GHL_APP_SHARED_SECRET` is used only server-side to decrypt HighLevel user context.
- `APP_SESSION_SECRET` signs the short-lived token used between the web component and API.
- If OpenRouter configuration is missing or a provider request fails, analysis is marked failed and the call detail drawer exposes a retry action.

## Local Development

```sh
pnpm install
pnpm build
pnpm dev:api
```

Open:

```text
http://localhost:3000/embed
```

Start the OAuth install flow:

```text
http://localhost:3000/oauth/install
```

For a public HighLevel sandbox test, expose the API with a tunnel such as ngrok and set `APP_ORIGIN` to that public origin.

## Documentation

- [HighLevel sandbox setup with local API and ngrok](docs/sandbox-local-ngrok.md)
- [Architecture and Team of One ownership](docs/architecture-and-team-of-one.md)
- [Functional vs mocked notes](docs/functional-vs-mocked.md)
- [HighLevel Custom JS injection snippet](docs/highlevel-custom-js-injection.md)
- [Deployment with GitHub Actions and Argo CD](docs/deployment.md)

## HighLevel Webhook

Configure the marketplace webhook URL to:

```text
https://your-public-api-origin/webhooks/ghl
```

Subscribe it to the `VoiceAiCallEnd` event.

The endpoint responds quickly, stores the event, and queues asynchronous analysis. Signature verification is enforced when one of the webhook public-key env vars is configured.

## HighLevel UI Injection

The intended Custom JS integration adds an Observability tab under the existing Voice AI dashboard/logs area and mounts the custom element inside that tab.

The minimal mount shape is:

```html
<script
  type="module"
  src="https://your-public-api-origin/widget/observability-copilot.js"
></script>
<observability-copilot
  api-base-url="https://your-public-api-origin"
  app-id="your-marketplace-app-id"
  agent-id="optional-agent-id"
></observability-copilot>
```

The component reads HighLevel session context from `window.exposeSessionDetails(appId)`, sends the encrypted context to the backend, and then uses the returned app-session token for protected API calls.

## API Endpoints

- `GET /health`: health check.
- `GET /oauth/install`: starts the HighLevel OAuth install flow.
- `GET /oauth/callback`: exchanges the OAuth code and stores sessions in SQLite.
- `GET /api/ghl/sessions`: lists stored sessions without token values.
- `POST /api/auth/ghl-context`: exchanges encrypted HighLevel user context for an app-session token.
- `POST /webhooks/ghl`: receives `VoiceAiCallEnd` events and queues analysis.
- `GET /api/voice-ai/agents`: lists Voice AI agents for the active location.
- `GET /api/voice-ai/call-logs`: returns call logs enriched with analysis and dashboard KPIs.
- `GET /api/voice-ai/call-logs/:callId`: returns call detail enriched with analysis.
- `POST /api/voice-ai/call-logs/:callId/review/retry`: retries failed analysis for a call.
- `GET /widget/observability-copilot.js`: serves the compiled web component.
- `GET /embed`: local test page.
