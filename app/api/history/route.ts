import { listRuns } from '@/lib/db'

export async function GET() {
  try {
    const runs = await listRuns()
    return Response.json(runs)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch history.'
    return Response.json({ error: message }, { status: 500 })
  }
}
