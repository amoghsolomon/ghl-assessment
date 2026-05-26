# HighLevel Sandbox Setup with Local API and Ngrok

These steps run the observability suite locally and expose it to a HighLevel sandbox through ngrok.

## Prerequisites

- Node.js 24+
- pnpm
- ngrok
- HighLevel sandbox account
- HighLevel Marketplace app credentials
- OpenRouter API key and model id

## 1. Install Dependencies

```sh
pnpm install
pnpm build
```

## 2. Start Ngrok

In a separate terminal:

```sh
ngrok http 3000
```

Copy the HTTPS forwarding origin, for example:

```text
https://example.ngrok-free.app
```

Use that value anywhere this doc refers to `NGROK_ORIGIN`.

## 3. Configure Environment

Create or update `.env` in the repo root:

```sh
APP_ORIGIN=NGROK_ORIGIN

GHL_CLIENT_ID=your-client-id
GHL_CLIENT_SECRET=your-client-secret
GHL_OAUTH_SCOPES=voice-ai-dashboard.readonly voice-ai-agents.readonly voice-ai-agent-goals.readonly
GHL_VERSION_ID=your-marketplace-app-version-id
GHL_APP_ID=your-marketplace-app-id
GHL_APP_SHARED_SECRET=your-marketplace-shared-secret
APP_SESSION_SECRET=replace-with-a-random-session-secret

OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=your-openrouter-model-id
```

Optional local persistence overrides:

```sh
GHL_SESSION_DB_PATH=./data/ghl-sessions.sqlite
COPILOT_DB_PATH=./data/ghl-sessions.sqlite
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Restart the API whenever the ngrok origin or env values change.

## 4. Run the API

```sh
pnpm dev:api
```

Check the public health endpoint:

```text
NGROK_ORIGIN/health
```

The compiled web component should also be reachable at:

```text
NGROK_ORIGIN/widget/observability-copilot.js
```

## 5. Configure the HighLevel Marketplace App

In the HighLevel Marketplace app settings, use:

```text
OAuth callback URL: NGROK_ORIGIN/oauth/callback
Webhook URL:        NGROK_ORIGIN/webhooks/ghl
```

Use the same OAuth scopes configured in `.env`:

```text
voice-ai-dashboard.readonly
voice-ai-agents.readonly
voice-ai-agent-goals.readonly
```

Subscribe the webhook to:

```text
VoiceAiCallEnd
```

## 6. Install the App into the Sandbox Location

Open:

```text
NGROK_ORIGIN/oauth/install
```

Choose the sandbox location that contains the Voice AI agent and call logs. After the callback succeeds, the API stores the OAuth session in SQLite.

## 7. Add the HighLevel Custom JS

Use the full reference snippet in [`highlevel-custom-js-injection.md`](highlevel-custom-js-injection.md).

Set:

```js
API_ORIGIN: 'NGROK_ORIGIN',
APP_ID: 'your-marketplace-app-id',
```

The script adds an `Observability` tab under the Voice AI dashboard/logs section and mounts the web component inside it.

## 8. Open the Voice AI Page

In HighLevel, go to the sandbox location and open:

```text
AI Agents -> Voice AI
```

Then open the dashboard/logs area and select the `Observability` tab. The component should authenticate through HighLevel page context, load agents and call logs, and show analysis status for each call.

## 9. Generate or Load Call Data

For new calls, the `VoiceAiCallEnd` webhook queues analysis after the call ends.

For existing calls, opening the Observability tab fetches call logs and queues any missing analyses. This provides a fallback if a webhook was not received while testing.

## Troubleshooting

- `Missing encryptedData`: the `APP_ID` in Custom JS does not match the Marketplace app id, or the component is not running inside the expected HighLevel context.
- `No OAuth session stored for this HighLevel location`: run `NGROK_ORIGIN/oauth/install` and install the app into the same location you are viewing.
- OAuth callback mismatch: update the Marketplace callback URL and `APP_ORIGIN` to the current ngrok HTTPS origin, then restart the API.
- `Provider returned error`: check `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and OpenRouter account access.
- Webhook does not fire: verify the webhook URL, event subscription, and that ngrok is still running with the same origin.
