const MODELS = [
  'claude-sonnet-4-6',
  'aws/claude-sonnet-4-6',
  'zenlayer/claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

async function testModel(model: string, apiKey: string) {
  const start = Date.now()
  try {
    const res = await fetch('https://athenai.mihoyo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        stream: false,
        messages: [{ role: 'user', content: 'Say hi.' }],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const elapsed = Date.now() - start
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }
    return { model, ok: res.ok, status: res.status, elapsed_ms: elapsed, body }
  } catch (err: unknown) {
    return {
      model,
      ok: false,
      elapsed_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const results = await Promise.all(MODELS.map((m) => testModel(m, apiKey)))
  return Response.json(results, { status: 200 })
}
