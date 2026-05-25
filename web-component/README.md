# Observability Copilot Web Component

Vue/Vite app that compiles to a native custom element.

```sh
pnpm install
pnpm dev
pnpm build
```

The production build emits `dist/observability-copilot.js`, which registers:

```html
<observability-copilot api-base-url="https://your-api-host"></observability-copilot>
```

The component accepts these attributes:

- `api-base-url`: Hono API origin. Empty string uses the current origin.
- `app-id`: HighLevel Marketplace app id, required for `window.exposeSessionDetails(appId)` in Custom JS injection.
- `agent-id`: optional Voice AI agent id.
