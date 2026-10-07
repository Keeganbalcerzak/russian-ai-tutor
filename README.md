# 🇷🇺 Russian Conversation Tutor

A local web app that helps you learn Russian by **chatting with an AI tutor**. It:

1. **Tracks your vocabulary** — every word you use is recorded with spaced-repetition
   (SM‑2) scheduling, so words you're learning resurface for review and words you start
   **forgetting** get flagged as `STRUGGLING`.
2. **Corrects you retrospectively** — your messages aren't interrupted. After each turn an
   analyzer logs your mistakes (with friendly explanations and a grammar-concept tag) into a
   side panel and the dashboard.
3. **Suggests future topics** — based on the words you owe a review and the grammar concepts
   you struggle with, it proposes conversation scenarios that force you to practice them, and
   gives an end-of-session review with "next time, try…" ideas.

Plus **text-to-speech**: tap 🔊 on any bot reply, correction, or vocabulary word to hear it.

## Tech stack

- **Next.js (App Router) + TypeScript + React + Tailwind CSS**
- **Prisma 7 + SQLite** (local `dev.db`) via the `better-sqlite3` driver adapter
- **OpenAI** for chat (streaming), structured analysis (Structured Outputs), and TTS

## Setup

1. **Install dependencies** (already done if you scaffolded here):
   ```bash
   npm install
   ```

2. **Add your OpenAI API key.** Copy `.env.example` to `.env` (one already exists) and set:
   ```env
   OPENAI_API_KEY=sk-...
   ```
   Get a key at https://platform.openai.com/api-keys.

   Also supported (see `.env.example`): `GEMINI_API_KEY` (fallback LLM) and
   `ELEVENLABS_API_KEY` (optional neural TTS).

   Optional model overrides (defaults shown):
   ```env
   OPENAI_CHAT_MODEL=gpt-5.1-chat-latest
   OPENAI_ANALYZER_MODEL=gpt-5-mini
   OPENAI_TTS_MODEL=gpt-4o-mini-tts
   ```
   If a default model isn't available on your account, change it here and restart.
   (List what your key can use: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`.)

3. **Set up the database** (already migrated; re-run if you change `prisma/schema.prisma`):
   ```bash
   npx prisma migrate dev
   ```

4. **Run it:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000. On first load you'll pick a level (defaults to Beginner) and a
   starter vocabulary set is seeded.

## Using it

- **Chat** in Russian (type with a Cyrillic keyboard — on Windows, add the Russian keyboard
  layout under Settings → Time & language → Language). Press **Enter** to send.
- The **Corrections** panel fills in after each turn.
- **✨ Topics** suggests conversations targeting your weak spots.
- **End & review** writes a session recap and proposes follow-up topics.
- **Dashboard** shows your vocabulary (filterable by due / struggling / learning / known),
  grammar-concept mastery, and recent corrections.

## Inspecting your data

```bash
npx prisma studio
```
Opens a browser UI to view the `Word`, `Concept`, `Mistake`, `Conversation`, and `Message`
tables.

## Notes

- Single-user, local-only (no authentication) — meant to run on your own machine.
- Cached TTS audio is stored under `public/audio/` (gitignored).
