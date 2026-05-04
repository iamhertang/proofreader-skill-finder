import OpenAI from 'openai'
import type { AnalysedRow, ContentType } from './types'

// ⚠️ FLAG: Set ANTHROPIC_API_KEY in .env.local and Vercel env vars
// Base URL points to the internal OpenAI-compatible LLM gateway
const client = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://athenai.mihoyo.com/v1',
  timeout: 240_000,
  maxRetries: 0,
})

const MODEL = 'aws/claude-sonnet-4-6'

const LANGUAGE_NAMES: Record<string, string> = {
  EN: 'English',
  DE: 'German',
  FR: 'French',
  JP: 'Japanese',
  KR: 'Korean',
  ES: 'Spanish',
  PT: 'Portuguese',
  ID: 'Indonesian',
  VN: 'Vietnamese',
  TH: 'Thai',
  RU: 'Russian',
}

// Keep examples minimal — gateway has a ~10s hard timeout.
// Fewer tokens in = faster first token out = more likely to complete.
const MAX_CORRECTIONS_PER_TYPE = 5
const MAX_ACCEPTED_PER_TYPE = 2

function buildPrompt(rows: AnalysedRow[], lang: string): string {
  const langName = LANGUAGE_NAMES[lang] ?? lang

  const byType: Partial<Record<ContentType, AnalysedRow[]>> = {}
  for (const row of rows) {
    if (!byType[row.contentType]) byType[row.contentType] = []
    byType[row.contentType]!.push(row)
  }

  const blocks: string[] = []

  for (const [type, typeRows] of Object.entries(byType)) {
    const corrected = typeRows
      .filter((r) => r.diffClass !== 'accepted')
      .slice(0, MAX_CORRECTIONS_PER_TYPE)
    const accepted = typeRows
      .filter((r) => r.diffClass === 'accepted')
      .slice(0, MAX_ACCEPTED_PER_TYPE)

    if (corrected.length === 0 && accepted.length === 0) continue

    let block = `### Content Type: ${type}\n`

    if (corrected.length > 0) {
      block += `\n**Corrections (${corrected.length}):**\n`
      for (const r of corrected) {
        block += `\n[${r.diffClass}] TextID: ${r.textId}\n`
        block += `  Source (CHS): ${r.chs}\n`
        block += `  AI output:    ${r.target}\n`
        block += `  Human fix:    ${r.targetPR}\n`
        if (r.extra) block += `  Context:      ${r.extra}\n`
      }
    }

    if (accepted.length > 0) {
      block += `\n**Accepted without change (${accepted.length} sample):**\n`
      for (const r of accepted) {
        block += `  - ${r.textId}: "${r.target}"\n`
      }
    }

    blocks.push(block)
  }

  return `You are a senior localisation QA analyst. You have been given a dataset of AI-generated game translations (Chinese → ${langName}) alongside human proofreader corrections.

Your job: analyse the correction patterns and produce a structured, actionable skill file that an AI proofreading agent can use as its knowledge base.

---

## Dataset

${blocks.join('\n\n')}

---

## Required Output

Produce exactly four sections in this order. Be specific and cite actual examples from the data. Use bullet points throughout.

**## 1. Correction Patterns by Content Type**
For each content type that had corrections, create a sub-heading (e.g., ### ui_text) and list:
- The recurring error pattern (what the AI tends to do wrong)
- The corrective rule (what the human consistently applied instead)
- 1–2 concrete before/after examples from the data

**## 2. Human Inconsistencies**
List cases where the same source construct, term, or linguistic pattern was handled differently across multiple corrections — indicating the human proofreader was not fully consistent. Flag each inconsistency clearly and note both versions used. These are advisory: the AI agent should be aware but use judgement.

**## 3. Red Flags**
List the specific issues the AI agent must check first on every string before approving. These are the highest-priority, highest-frequency problems found in the corrections. Format as a numbered checklist.

**## 4. What the AI Gets Right**
Based on accepted rows and consistent patterns, list what the AI already does well in ${langName} game localisation. These are patterns the agent must NOT change or second-guess.`
}

export async function analyseCorrectionPatterns(
  rows: AnalysedRow[],
  lang: string,
): Promise<string> {
  const prompt = buildPrompt(rows, lang)

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  })

  return response.choices[0]?.message?.content ?? ''
}
