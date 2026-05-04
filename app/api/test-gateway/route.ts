export async function GET() {
  const url = 'https://athenai.mihoyo.com/v1/chat/completions'
  const start = Date.now()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'aws/claude-sonnet-4-6',
        max_tokens: 10,
        stream: false,
        messages: [{ role: 'user', content: 'Say hi.' }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    const elapsed = Date.now() - start
    const body = await res.text()

    return Response.json({
      ok: res.ok,
      status: res.status,
      elapsed_ms: elapsed,
      body: JSON.parse(body),
    })
  } catch (err: unknown) {
    const elapsed = Date.now() - start
    return Response.json({
      ok: false,
      elapsed_ms: elapsed,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 502 })
  }
}
