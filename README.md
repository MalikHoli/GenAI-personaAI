# GenAI-personaAI

A small web app that lets you chat with AI personas modeled on two well-known Hindi/English coding educators — **Hitesh Choudhary** (Chai aur Code) and **Piyush Garg**. Each persona has its own system prompt that shapes its tone, language style, and teaching philosophy, so conversations feel close to how that mentor actually talks.

> **Disclaimer:** These are AI personas inspired by public personalities — not the real individuals, and not affiliated with or endorsed by them.

## Features

- Pick a persona from the home screen and start chatting instantly
- Distinct voice, teaching style, and Hinglish tone per persona, driven by tailored system prompts
- Simple, responsive chat UI with a persona switcher sidebar
- Backend proxy to the OpenAI Chat Completions API so the API key never reaches the browser

## Tech stack

- **Frontend:** Plain HTML/CSS/JS (`index.html`, `chat.html`, `script.js`, `style.css`) — no build step or framework
- **Backend:** A single serverless function (`api/chat.js`) deployed on [Vercel](https://vercel.com), calling OpenAI's `gpt-4o-mini` model
- **Config:** [`dotenv`](https://www.npmjs.com/package/dotenv) for loading local environment variables

## Project structure

```
.
├── index.html        # Home page — persona selection
├── chat.html          # Chat page — conversation UI
├── script.js          # Persona data, rendering, and chat logic (shared by both pages)
├── style.css           # Styling for both pages
├── api/
│   └── chat.js         # Serverless function — builds the prompt and calls OpenAI
├── package.json
└── .gitignore
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (for local tooling)
- An [OpenAI API key](https://platform.openai.com/api-keys)
- The [Vercel CLI](https://vercel.com/docs/cli) for running the serverless API locally: `npm i -g vercel`

### Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/MalikHoli/GenAI-personaAI.git
   cd GenAI-personaAI
   npm install
   ```

2. Create a `.env.local` file in the project root with your OpenAI API key:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

3. Run the app locally:
   ```bash
   vercel dev
   ```
   This serves the static pages and the `api/chat.js` function together, matching how it runs in production.

4. Open the printed local URL in your browser and pick a persona to start chatting.

## Deployment

The project is set up to deploy directly on [Vercel](https://vercel.com) — connect the repo, add `OPENAI_API_KEY` as an environment variable in the project settings, and deploy. No additional build configuration is needed.

## Adding or editing personas

Persona metadata (name, tagline, avatar color/initials) lives in `script.js` under the `PERSONAS` object, and each persona's system prompt lives in `SYSTEM_PROMPTS` in `api/chat.js`. Add a new numeric key to both to introduce a new persona.

## License

ISC — see [package.json](./package.json) for details.
