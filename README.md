# GenAI PersonaAI

A **UI-based web app** that lets you chat with AI personas modeled on two well-known Hindi/English coding educators — **Hitesh Choudhary** (Chai aur Code) and **Piyush Garg** (Teachyst). Under the hood, every reply is produced by a **multi-model self-consistency pipeline**: three different LLMs answer the same prompt in parallel, and a judge model evaluates all three and returns the best one — which you can inspect right in the chat.

> **Disclaimer:** These are AI personas inspired by public personalities — not the real individuals, and not affiliated with or endorsed by them.

## How the project works

The app is a static frontend (plain HTML/CSS/JS, no framework or build step) talking to a single serverless function:

```
Browser (index.html → chat.html + script.js)
        │  POST /api/chat  { personaId, history }
        ▼
api/chat.js  (Vercel serverless function)
        │
        ├── 1. Guardrails (before any model call)
        │      • message length cap (1000 chars) & thread turn cap (30 turns)
        │      • regex moderation: prompt-injection & off-domain detection
        │      → blocked inputs get a canned, in-persona reply instantly
        │
        ├── 2. Prompt assembly (api/lib/prompt-assembler.js)
        │      layered persona system prompt (see below)
        │
        ├── 3. Candidate generation — 3 models called IN PARALLEL
        │      gpt-4o-mini · claude-haiku-4-5 · gemini-2.5-flash
        │
        ├── 4. Self-consistency judge (claude-haiku-4-5)
        │      evaluates all candidates → picks or repairs the best one
        │
        └── 5. Streamed response (NDJSON status events)
               "generating…" → "evaluating…" → final reply + all candidates
```

While you wait, the chat shows a live typing indicator whose label follows the real pipeline stage (*"Gathering responses from 3 models…"* → *"Evaluating responses & picking the best…"*) — these are actual streamed events from the backend, not a timer.

Each persona's character comes from a layered system prompt (`api/personas/*.prompt.js`), assembled from reusable blocks:

- **Identity block** — who the persona is, teaching philosophy, and an explicit "you are an AI persona, not the real person" rule
- **Voice rules** — Hinglish style, signature phrases, tone
- **Refusal rules** (shared template in `shared.prompt.js`) — stay in character, no badmouthing other educators, no fabricated course/price claims, resist jailbreak attempts
- **Few-shot examples** — three sample Q&A pairs in the persona's voice
- **Critical reminder** — a short stay-in-character nudge at the end of the prompt
- **Drift refresh** — from turn 15 onward, every 10 turns a compact character reminder is re-injected so long conversations don't drift into a generic assistant voice

## CLI or UI?

**UI-based.** There is no CLI. You interact entirely in the browser:

- **Home page** (`index.html`) — pick a persona
- **Chat page** (`chat.html`) — conversation UI with a persona-switcher sidebar, light/dark theme toggle, live pipeline status while a reply is being produced, and a per-reply **"⚖ Compare the 3 model responses"** switch that flips any answer open to show all three raw candidate responses (with the judge's pick highlighted) and back

Chats are kept in memory only — nothing is persisted; a page reload starts fresh.

## Models / providers used

| Role | Model | Provider | SDK |
|---|---|---|---|
| Candidate 1 | `gpt-4o-mini` | OpenAI | `openai` |
| Candidate 2 | `claude-haiku-4-5` | Anthropic | `@anthropic-ai/sdk` |
| Candidate 3 | `gemini-2.5-flash` | Google | `@google/generative-ai` |
| Judge / selector | `claude-haiku-4-5` | Anthropic | `@anthropic-ai/sdk` |

All API keys stay server-side in the serverless function — the browser never sees them.

## How the self-consistency flow is implemented

Self-consistency here means: **don't trust a single model's answer — generate several and let a judge pick the most consistent, in-character one.**

1. **Fan-out** (`api/lib/self-consistency-assembler.js` → `generateLatestResponse`):
   The assembled persona prompt + conversation history is sent to all three candidate models **in parallel** (`Promise.allSettled`), so one slow or failed provider never blocks the others. Failed or empty responses are dropped; whatever survives moves on.

2. **Judge prompt** (`selfConsitencyPromptAssembler` + `api/personas/self-consistency.prompt.js`):
   A separate system prompt is built for the judge containing:
   - its role (select the best response, or repair one if none qualifies),
   - **10 evaluation criteria** — stays in character, readable, guardrails respected, declines jailbreaks politely, no harmful content, no badmouthing other educators, consistent with the persona's teachings, natural phrasing, correct list numbering, never leaks the evaluation itself,
   - the conversation history,
   - the three candidates labeled **Response A / B / C**,
   - a **strict JSON output format** with correct/wrong few-shot examples.

3. **Selection** (`api/chat.js`):
   The judge (claude-haiku-4-5) must answer with a single JSON object:
   ```json
   { "response": "A" | "B" | "C" | "D", "responseContent": "<final reply text>" }
   ```
   `"D"` means the judge modified a candidate because none fully met the criteria. Two robustness tricks make this reliable:
   - the assistant turn is **prefilled with `{`**, forcing the model to start with JSON instead of prose commentary;
   - the output is validated against a **Zod schema** (`api/lib/response-schema.js`). If validation fails, the app falls back to the first raw candidate so the user never sees evaluation commentary.

4. **Transparency in the UI:**
   The API returns the final reply **plus all three raw candidates and the selected label**. Every assistant message in the chat carries the compare switch, so you can see exactly what each model answered and which one the judge chose (or that it repaired one — Response D).

## Project structure

```
.
├── index.html                          # Home page — persona selection
├── chat.html                           # Chat page — conversation UI
├── script.js                           # Persona metadata, rendering, chat + streaming logic
├── style.css                           # Styling, incl. candidate comparison & typing indicator
├── api/
│   ├── chat.js                         # Serverless entry — guardrails, pipeline, streamed events
│   ├── lib/
│   │   ├── prompt-assembler.js         # Builds the layered persona system prompt
│   │   ├── self-consistency-assembler.js  # Parallel fan-out + judge prompt assembly
│   │   ├── response-schema.js          # Zod schema & parser for the judge's JSON output
│   │   ├── moderation.js               # Regex prompt-injection & off-domain filters
│   │   └── context-config.js           # Tunables: turn caps, drift-refresh cadence
│   └── personas/
│       ├── hitesh.prompt.js            # Hitesh persona blocks (identity, voice, few-shots…)
│       ├── piyush.prompt.js            # Piyush persona blocks
│       ├── shared.prompt.js            # Refusal rules template shared by all personas
│       ├── self-consistency.prompt.js  # Judge identity, evaluation criteria, output format
│       └── persona.registry.js         # personaId → persona prompt lookup
├── assets/                             # Persona avatars
└── package.json
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/)
- API keys for all three providers:
  - [OpenAI](https://platform.openai.com/api-keys)
  - [Anthropic](https://console.anthropic.com/)
  - [Google AI Studio](https://aistudio.google.com/apikey)
- The [Vercel CLI](https://vercel.com/docs/cli) for running the serverless API locally: `npm i -g vercel`

### Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/MalikHoli/GenAI-personaAI.git
   cd GenAI-personaAI
   npm install
   ```

2. Create a `.env.local` file in the project root:
   ```
   OPENAI_API_KEY=your-openai-key
   ANTHROPIC_API_KEY=your-anthropic-key
   GEMINI_API_KEY=your-gemini-key
   ```

3. Run the app locally:
   ```bash
   vercel dev
   ```
   This serves the static pages and the `api/chat.js` function together, matching production.

4. Open the printed local URL, pick a persona, and start chatting. Send a question and try the **compare** switch on the reply to watch the self-consistency pipeline at work.

## Deployment

Deploys directly on [Vercel](https://vercel.com): connect the repo, add `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY` as environment variables in the project settings, and deploy. The chat function exports `config = { supportsResponseStreaming: true }` so Vercel streams the status events instead of buffering them — no other build configuration is needed.

## Adding or editing personas

1. **Frontend:** add an entry to the `PERSONAS` object in `script.js` (name, tagline, avatar).
2. **Backend:** create `api/personas/<name>.prompt.js` with the persona's blocks (`identityBlock`, `voiceRules`, `fewShots`, `driftRefresh`, canned fallback templates) — use `buildRefusalRules()` from `shared.prompt.js` for the refusal rules — and register it in `persona.registry.js` under the same numeric id used in `PERSONAS`.

## License

ISC — see [package.json](./package.json) for details.
