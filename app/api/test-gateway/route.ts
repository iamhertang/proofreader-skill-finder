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
    })
    const elapsed = Date.now() - start
    const text = await res.text()
    let body: unknown = text
    try { body = JSON.parse(text) } catch { /* keep as raw text */ }
    return { model, ok: res.ok, status: res.status, elapsed_ms: elapsed, body }
  } catch (err: unknown) {
    return {
      model,
      ok: false,
      elapsed_ms: Date.now() - start,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    }
  }
}

export async function GET() {
  // Security fix: gate this debug endpoint so it only works outside production.
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not Found', { status: 404 })
  }

  const apiKey = process.env.ATHENAI_API_KEY ?? ''
  if (!apiKey) return Response.json({ error: 'ATHENAI_API_KEY not set' }, { status: 500 })

  const results = await Promise.all(MODELS.map((m) => testModel(m, apiKey)))
  return Response.json(results, { status: 200 })
}
