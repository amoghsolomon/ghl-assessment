# Architecture and Team of One Ownership

This project is a HighLevel Voice AI observability prototype that adds an embedded analysis surface inside the existing Voice AI area. The main product decision was to avoid replacing HighLevel's native dashboard and logs. Instead, the app adds an `Observability` tab that focuses on triage, call health, AI findings, and actionable agent-tuning recommendations.

## Architecture

```text
HighLevel Voice AI page
  -> Custom JS adds the Observability tab
  -> Vue custom element mounts inside the tab
  -> Hono API authenticates the embedded session
  -> HighLevel SDK fetches agents and call logs
  -> SQLite stores OAuth sessions, webhook events, call logs, and analyses
  -> In-process queue analyzes calls
  -> Vercel AI SDK calls OpenRouter for structured analysis
```

The web component is compiled as a custom element and served by the Hono API from `/widget/observability-copilot.js`. This keeps the HighLevel integration lightweight: Custom JS only loads the component and provides the mount point.

Authentication has two parts. First, OAuth is completed through the HighLevel marketplace install flow and stored in SQLite. Second, the embedded component reads HighLevel's encrypted page context with `window.exposeSessionDetails(appId)`, sends it to the API, and receives a short-lived app-session token for subsequent API calls.

The analysis pipeline is event-driven but intentionally simple. `VoiceAiCallEnd` webhooks store the call payload and queue analysis. Loading call logs also reconciles missing analyses, so a missed webhook does not permanently hide a call from the review pipeline.

## Product Ownership

The product scope was centered on the "monitor and analyze" loop from the assignment. The UI highlights calls that need attention, explains why, and connects recommendations back to actual Voice AI agent configuration surfaces such as prompt text, patience settings, max duration, idle reminders, and action/tool descriptions.

The dashboard KPIs are derived from structured analysis enums rather than free-form text. This makes success rate, completion quality, healthy calls, sentiment, and tool accuracy aggregatable across the selected date range and agent filter.

## Design Ownership

The UI was designed to sit inside the existing HighLevel Voice AI dashboard instead of feeling like a separate product. It keeps the familiar agent selector and date range controls, uses Naive UI components, and follows the same dashboard-first flow: filters, KPI cards, call list, then detailed call drawer.

The call detail view emphasizes readable transcript review and tool debugging. Transcript and tool calls are shown as a waterfall-style timeline so latency, sequencing, and tool correctness can be inspected together.

## Engineering Ownership

The backend is a Hono app running on Node 24. It uses the HighLevel SDK for OAuth, location sessions, agents, and call logs. SQLite is used for local persistence because it is enough for the prototype and keeps setup small.

The AI review uses the Vercel AI SDK with an OpenRouter model and a Zod schema. The schema forces enums for outcome, sentiment, failure reason, health rating, tool correctness, and recommendation targets so the frontend can compute stable KPIs.

The app is packaged as one Docker image containing the API and compiled web component. The deployment path uses GitHub Actions to publish to GHCR and a Helm chart to run the app on Kubernetes.

## QA Ownership

Manual QA focused on the complete sandbox workflow: OAuth install, session-context authentication, Custom JS injection, call-log loading, analysis retry, dropdown/date-picker behavior inside HighLevel, drawer behavior, transcript/tool waterfall rendering, and dashboard KPI calculations.

Build checks were run with `pnpm build`, and the Docker image was validated locally. The Kubernetes readiness issue was also checked end to end by confirming that the container exposes `/health` correctly when bound to the container interface.
