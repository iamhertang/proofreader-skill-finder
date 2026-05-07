# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build (also runs TypeScript type check)
npm run lint     # ESLint
```

There are no tests. `npm run build` is the primary way to catch type errors before pushing.

## Environment Variables

Set in `.env.local` (local) and Vercel project settings (production):

```
ANTHROPIC_API_KEY      # miHoYo internal LLM gateway key (sk-...), NOT an Anthropic key
DATABASE_URL           # Neon dashboard → Connection Details
BLOB_READ_WRITE_TOKEN  # Vercel dashboard → Storage → Blob
```

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are optional — the pipeline still runs without them, history saving is skipped.

## LLM Gateway

The app calls `https://athenai.mihoyo.com/v1` — an internal miHoYo OpenAI-compatible proxy that routes to Claude. **This gateway is only reachable from inside miHoYo's corporate network.** Public cloud platforms (Vercel, EdgeOne, etc.) are blocked at the firewall. The OpenAI SDK is used (not the Anthropic SDK) with `baseURL` set to the gateway. Config lives in `lib/llm.ts`:

- Model: `claude-sonnet-4-6`
- Non-streaming (`stream: false`), `max_tokens: 2000`
- `timeout: 240_000`, `maxRetries: 0`

## Architecture

### What the app does
Takes an Excel file with five columns (`TextID`, `CHS`, `Target`, `Target (PR)`, `EXTRA`) representing Chinese → target-language game localisation data where humans have corrected AI translations. Runs the data through an analysis pipeline and produces a structured `.md` Skill file for an AI proofreading agent (小墨).

### Pipeline (triggered by `POST /api/process`, streams SSE)
```
Excel upload → parse (lib/excel.ts)
             → word-level diff per row (lib/diff.ts)
             → content type inference from TextID (lib/content-type.ts)
             → LLM pattern analysis (lib/llm.ts)
             → Skill MD generation (lib/skill-generator.ts)
             → upload .xlsx to Vercel Blob + persist to Neon (lib/db.ts)
```

Progress is streamed to the client as Server-Sent Events. The route sets `export const maxDuration = 300` (requires Vercel Pro — confirmed active, 5-minute limit).

The client uses `fetch()` + `ReadableStream` reader (not `EventSource`, which doesn't support POST). Partial chunk buffering is handled in `app/page.tsx`'s `handleRun`.

### Key design decisions

**Diff classification** (`lib/diff.ts`): Word-frequency comparison (not LCS). CJK target languages (JP, KR, TH) are tokenised character-by-character; others split on whitespace. Thresholds: ≤20% → `word_swap`, 20–60% → `phrase_restructure`, >60% → `full_rewrite`, 0% → `accepted`.

**Content type inference** (`lib/content-type.ts`): Keyword matching on `TextID` (case-insensitive substring). Order matters — `loading_screen` is checked before `ui_text` to avoid false matches.

**LLM prompt** (`lib/llm.ts`): Sends up to 5 corrections + 2 accepted samples per content type (`MAX_CORRECTIONS_PER_TYPE = 5`, `MAX_ACCEPTED_PER_TYPE = 2`). Kept small to fit within gateway response time limits.

**Error handling** (`app/api/process/route.ts`): The catch block logs the full error via `console.error` (visible in Vercel Function Logs) and enriches the message for `OpenAI.APIError` instances with HTTP status and gateway detail. The client renders errors in a `<pre>` block with `whitespace-pre-wrap`.

**History** (`lib/db.ts`): Neon via `@neondatabase/serverless` HTTP transport. Max 3 runs enforced server-side on each insert — oldest rows and their Blob files are evicted automatically.

### Neon schema

```sql
CREATE TABLE IF NOT EXISTS runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  language    VARCHAR(10) NOT NULL,
  filename    TEXT        NOT NULL,
  blob_url    TEXT,
  row_count   INT,
  stats       JSONB,
  skill_md    TEXT
);
```

### Debug route

`app/api/test-gateway/route.ts` — `GET /api/test-gateway` probes the miHoYo gateway with a minimal request across all model routing backends. **Disabled in production** (`NODE_ENV === 'production'` returns 404). Uses `ATHENAI_API_KEY` env var (separate from `ANTHROPIC_API_KEY`).

### Other files

`concept-map.html` — standalone presentation file in the project root, not part of the Next.js app. Open directly in a browser. Not deployed.

### Adding a new target language
Add an entry to the `LANGUAGES` array in `lib/types.ts`. No other changes needed.

### Adding a new content type
1. Add the type to the `ContentType` union in `lib/types.ts`
2. Add keyword rules in `lib/content-type.ts`
3. Add a display label in `CONTENT_TYPE_LABELS` in `lib/types.ts`
4. Add the type with count `0` to the `stats.contentTypes` initialiser in `lib/skill-generator.ts`
