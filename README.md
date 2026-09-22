# IncidentAI — Production Debugging Copilot

Chat-first AI that investigates production incidents from pasted or synthetic logs, runs a multi-step **Cloudflare Workflow** for diagnosis with **Workers AI (Llama 3.3)**, and remembers incident state via **Durable Objects** + **D1**.

## Assignment coverage

| Requirement | Implementation |
| --- | --- |
| LLM | Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Workflow / coordination | `IncidentAnalysisWorkflow` + Worker API |
| User input (chat) | React chat UI served as Worker static assets |
| Memory / state | `IncidentDO` + D1 |

## Quick start

### Prerequisites

- Node.js 20+
- Cloudflare account with Workers AI enabled
- Wrangler authenticated (`npx wrangler login`)

### Install & run locally

```bash
npm install
npm run build:frontend
npm run db:migrate:local
npm run dev:worker
```

Open the URL Wrangler prints (usually `http://127.0.0.1:8787`).

For frontend HMR with API proxy:

```bash
# terminal 1
npm run dev:worker

# terminal 2
npm run dev:frontend
```

Then open `http://127.0.0.1:5173`.

### Local note

`wrangler dev --local` runs D1 / DO / Workflows offline. Workers AI requires a Cloudflare login (remote binding). Without auth, diagnosis and chat still work via **deterministic fallbacks** seeded from log patterns + incident memory so demos remain usable.

```bash
# Create a real D1 database and paste the id into worker/wrangler.toml
npx wrangler d1 create incident-ai

# Apply migrations remotely
cd worker && npx wrangler d1 migrations apply incident-ai --remote

# Build UI + deploy Worker (assets + API)
cd .. && npm run deploy
```

## Demo walkthrough

1. Click **Checkout API — DB connection exhaustion** (or another demo).
2. Click **Investigate** — workflow runs (collect → analyze → patterns → LLM → remediation → report).
3. Watch the right panel: status, metrics, diagnosis, checklist.
4. Ask in chat: *“Why are payment requests failing?”* or *“What did we determine?”*
5. Toggle remediation checkboxes; when all are done, status becomes **resolved**.

## Repo layout

```text
├── frontend/          # Vite + React + TypeScript + Tailwind
├── worker/            # Cloudflare Worker, Workflow, DO, D1, AI
├── docs/architecture.md
├── prompts/prompt-history.md
└── README.md
```

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Tests

```bash
npm test
```

Unit tests cover log parsing and pattern detection (the deterministic workflow steps).

## AI assistance

Development used Cursor Agent. Full prompt history: [prompts/prompt-history.md](prompts/prompt-history.md).
