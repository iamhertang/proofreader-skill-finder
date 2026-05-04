import { neon } from '@neondatabase/serverless'
import { del } from '@vercel/blob'
import type { RunRecord, Stats } from './types'

// ⚠️ FLAG: Set DATABASE_URL in .env.local — get from Neon dashboard > Connection Details
// ⚠️ FLAG: Set BLOB_READ_WRITE_TOKEN in .env.local — get from Vercel dashboard > Storage > Blob

function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add it to .env.local (see Neon dashboard).')
  }
  return neon(process.env.DATABASE_URL)
}

const MAX_RUNS = 3

export async function insertRun(
  run: Omit<RunRecord, 'id' | 'createdAt'>,
): Promise<string | null> {
  if (!process.env.DATABASE_URL) {
    console.warn('[db] DATABASE_URL not configured — skipping history save.')
    return null
  }

  const sql = getDb()

  const result = await sql`
    INSERT INTO runs (language, filename, blob_url, row_count, stats, skill_md)
    VALUES (
      ${run.language},
      ${run.filename},
      ${run.blobUrl},
      ${run.rowCount},
      ${JSON.stringify(run.stats)},
      ${run.skillMd}
    )
    RETURNING id
  `

  const id = result[0].id as string

  // Evict runs beyond the limit, also cleaning up their blobs
  const overflow = await sql`
    SELECT id, blob_url FROM runs
    WHERE id NOT IN (
      SELECT id FROM runs ORDER BY created_at DESC LIMIT ${MAX_RUNS}
    )
  `

  for (const old of overflow) {
    if (old.blob_url) {
      try {
        await del(old.blob_url as string)
      } catch {
        // blob may already be deleted or token not set — non-fatal
      }
    }
    await sql`DELETE FROM runs WHERE id = ${old.id}`
  }

  return id
}

export async function listRuns(): Promise<RunRecord[]> {
  if (!process.env.DATABASE_URL) return []

  const sql = getDb()

  const rows = await sql`
    SELECT id, created_at, language, filename, blob_url, row_count, stats, skill_md
    FROM runs
    ORDER BY created_at DESC
    LIMIT ${MAX_RUNS}
  `

  return rows.map((r) => ({
    id: r.id as string,
    createdAt: (r.created_at as Date).toISOString(),
    language: r.language as string,
    filename: r.filename as string,
    blobUrl: r.blob_url as string | null,
    rowCount: r.row_count as number,
    stats: r.stats as Stats,
    skillMd: r.skill_md as string,
  }))
}

export async function deleteRun(id: string): Promise<void> {
  if (!process.env.DATABASE_URL) return

  const sql = getDb()

  const rows = await sql`SELECT blob_url FROM runs WHERE id = ${id}`
  if (rows.length > 0 && rows[0].blob_url) {
    try {
      await del(rows[0].blob_url as string)
    } catch {
      // non-fatal
    }
  }

  await sql`DELETE FROM runs WHERE id = ${id}`
}
