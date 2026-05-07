import { listRuns } from '@/lib/db'

// Force dynamic so Next.js never statically caches this response
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const runs = await listRuns()
    return Response.json(runs)
  } catch (err: unknown) {
    console.error('[history GET]', err)
    return Response.json({ error: 'Failed to fetch history.' }, { status: 500 })
  }
}
