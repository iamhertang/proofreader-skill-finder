export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const start = Date.now()
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash-lite',
        max_tokens: 10,
        stream: false,
        messages: [{ role: 'user', content: 'Say hi.' }],
      }),
    })
    const elapsed = Date.now() - start
    const text = await res.text()
    let body: unknown = text
    try { body = JSON.parse(text) } catch { /* keep as raw text */ }
    return Response.json({ ok: res.ok, status: res.status, elapsed_ms: elapsed, body })
  } catch (err: unknown) {
    return Response.json({
      ok: false,
      elapsed_ms: Date.now() - start,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    }, { status: 502 })
  }
}
