import { saveUploadedFile } from '@/lib/storage'
import { parseAndValidate } from '@/lib/excel'
import { analyseRows } from '@/lib/diff'
import { computeStats, generateSkillMd } from '@/lib/skill-generator'
import { analyseCorrectionPatterns } from '@/lib/llm'
import { insertRun } from '@/lib/db'
import { LANGUAGES } from '@/lib/types'
import type { SSEEvent, Row, LanguageCode } from '@/lib/types'
import OpenAI from 'openai'

// Allow up to 300s for streaming on Vercel Pro; free tier allows ~60s
export const maxDuration = 300

const ALLOWED_LANGUAGE_CODES: string[] = LANGUAGES.map((l) => l.code)
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
const MAX_ROWS = 5000

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-() ]/g, '_').slice(0, 200)
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const file = formData.get('file') as File | null
  const rawLanguage = (formData.get('language') as string) || 'EN'

  if (!file) {
    return new Response('No file provided', { status: 400 })
  }

  // Validate file type server-side — extension check + magic bytes (PK\x03\x04 = ZIP/XLSX)
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return new Response('Only .xlsx files are accepted', { status: 400 })
  }
  const headerBytes = await file.slice(0, 4).arrayBuffer()
  const magic = new Uint8Array(headerBytes)
  if (magic[0] !== 0x50 || magic[1] !== 0x4B || magic[2] !== 0x03 || magic[3] !== 0x04) {
    return new Response('File does not appear to be a valid .xlsx file', { status: 400 })
  }

  // Enforce file size server-side (client check is bypassable)
  if (file.size > MAX_FILE_SIZE) {
    return new Response('File exceeds 50 MB limit', { status: 413 })
  }

  // Whitelist language to prevent prompt injection via this field
  const language = (ALLOWED_LANGUAGE_CODES.includes(rawLanguage) ? rawLanguage : 'EN') as LanguageCode

  const encoder = new TextEncoder()
  let controllerClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        if (controllerClosed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      const close = () => {
        if (controllerClosed) return
        controllerClosed = true
        controller.close()
      }

      try {
        // Step 1 — Parse
        send({ step: 1, label: 'Parsing Excel…', pct: 10 })
        const buffer = await file.arrayBuffer()

        // Step 2 — Validate
        send({ step: 2, label: 'Validating columns…', pct: 20 })
        const parsed = parseAndValidate(buffer)
        if (parsed.error) {
          send({ error: parsed.error })
          close()
          return
        }

        // Step 3 — Diff
        send({ step: 3, label: 'Computing diffs…', pct: 35 })
        const rows = parsed.rows as Row[]
        if (rows.length > MAX_ROWS) {
          send({ error: `File contains ${rows.length} rows. Maximum allowed is ${MAX_ROWS}.` })
          close()
          return
        }
        const analysed = analyseRows(rows, language)

        // Step 4 — Content types
        send({ step: 4, label: 'Classifying content types…', pct: 50 })
        const stats = computeStats(analysed)

        // Step 5 — LLM analysis
        send({ step: 5, label: 'Sending to LLM for analysis…', pct: 60 })
        const llmAnalysis = await analyseCorrectionPatterns(analysed, language)

        // Step 6 — Generate skill MD
        send({ step: 6, label: 'Generating Skill file…', pct: 85 })
        const skillMd = generateSkillMd(language, file.name, stats, llmAnalysis)

        // Step 6b — Save original file to local disk + persist to SQLite
        let blobUrl: string | null = null
        try {
          blobUrl = await saveUploadedFile(buffer, sanitiseFilename(file.name))
        } catch {
          // Non-fatal — continue without file archiving
        }

        let runId: string | null = null
        try {
          runId = await insertRun({
            language,
            filename: file.name,
            blobUrl,
            rowCount: analysed.length,
            stats,
            skillMd,
          })
        } catch {
          // Non-fatal — history won't be saved but results still returned
        }

        // Step 7 — Done
        send({ step: 7, label: 'Done!', pct: 100, result: skillMd, stats, runId })
      } catch (err: unknown) {
        console.error('[process] Pipeline error:', err)
        let message = 'An unexpected error occurred.'
        if (err instanceof OpenAI.APIError) {
          message = `LLM API error (HTTP ${err.status} ${err.name}): ${err.message}`
          if (err.error && typeof err.error === 'object' && 'message' in err.error) {
            message += `\nGateway detail: ${(err.error as { message: string }).message}`
          }
        } else if (err instanceof Error) {
          message = err.message
        }
        send({ error: message })
      }

      close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
