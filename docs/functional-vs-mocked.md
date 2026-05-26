# Functional vs Mocked Notes

This prototype is wired to real HighLevel sandbox data and a real AI provider path. The normal runtime path does not use fake call-log fixtures.

## Functional

- HighLevel UI embedding through Custom JS and a Vue custom element.
- OAuth install flow using HighLevel marketplace credentials.
- SQLite persistence for OAuth sessions, call logs, webhook events, queue state, and completed analyses.
- Embedded user authentication using HighLevel encrypted page context from `window.exposeSessionDetails(appId)`.
- Voice AI agent listing through the HighLevel SDK.
- Voice AI call-log listing and per-call detail loading through the HighLevel SDK.
- Near-real-time transcript ingestion after a call ends through the `VoiceAiCallEnd` webhook.
- Missed-webhook reconciliation when call logs are loaded from the UI.
- Transcript and tool-call visualization using HighLevel call-log fields such as `transcript`, `transcriptWithToolCalls`, `executedCallActions`, and extracted call data when present.
- AI analysis through the Vercel AI SDK with an OpenRouter model.
- Structured analysis output using enums for outcome, sentiment, failure reason, rating, recommendation targets, and tool correctness.
- Dashboard KPIs computed from stored structured analysis, not from display text.
- Per-call retry for failed AI analysis.

## What Is Mocked

There are no mocked call logs, mocked transcripts, mocked OAuth sessions, or mocked AI responses in the normal app flow.
