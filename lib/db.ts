/**
 * Local SQLite storage — replaces Neon (Postgres) for sandbox usage.
 * Database file is stored at <project>/data/runs.db
 * Uses better-sqlite3 (synchronous, no external service needed).
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { deleteUploadedFile } from './storage'
import type { RunRecord, Stats } from './types'

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'runs.db')

const MAX_RUNS = 3

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (_db) return _db
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
  _db = new Database(DB_PATH)
  // Enable WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL')
  _db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      language   TEXT NOT NULL,
      filename   TEXT NOT NULL,
      blob_url   TEXT,
      row_count  INTEGER NOT NULL,
      stats      TEXT NOT NULL,
      skill_md   TEXT NOT NULL
    )
  `)
  return _db
}

export async function insertRun(
  run: Omit<RunRecord, 'id' | 'createdAt'>,
): Promise<string | null> {
  try {
    const db = getDb()

    const insert = db.prepare(`
      INSERT INTO runs (language, filename, blob_url, row_count, stats, skill_md)
      VALUES (@language, @filename, @blobUrl, @rowCount, @stats, @skillMd)
    `)
    const result = insert.run({
      language: run.language,
      filename: run.filename,
      blobUrl: run.blobUrl ?? null,
      rowCount: run.rowCount,
      stats: JSON.stringify(run.stats),
      skillMd: run.skillMd,
    })

    // Get the auto-generated id
    const row = db.prepare(`SELECT id FROM runs WHERE rowid = ?`).get(result.lastInsertRowid) as { id: string }
    const id = row.id

    // Evict runs beyond MAX_RUNS limit, cleaning up their uploaded files
    const overflow = db.prepare(`
      SELECT id, blob_url FROM runs
      WHERE id NOT IN (
        SELECT id FROM runs ORDER BY created_at DESC LIMIT ?
      )
    `).all(MAX_RUNS) as Array<{ id: string; blob_url: string | null }>

    for (const old of overflow) {
      if (old.blob_url) deleteUploadedFile(old.blob_url)
      db.prepare(`DELETE FROM runs WHERE id = ?`).run(old.id)
    }

    return id
  } catch (err) {
    console.error('[db] insertRun error:', err)
    return null
  }
}

export async function listRuns(): Promise<RunRecord[]> {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT id, created_at, language, filename, blob_url, row_count, stats, skill_md
      FROM runs ORDER BY created_at DESC LIMIT ?
    `).all(MAX_RUNS) as Array<{
      id: string
      created_at: string
      language: string
      filename: string
      blob_url: string | null
      row_count: number
      stats: string
      skill_md: string
    }>

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      language: r.language,
      filename: r.filename,
      blobUrl: r.blob_url,
      rowCount: r.row_count,
      stats: JSON.parse(r.stats) as Stats,
      skillMd: r.skill_md,
    }))
  } catch (err) {
    console.error('[db] listRuns error:', err)
    return []
  }
}

export async function deleteRun(id: string): Promise<void> {
  try {
    const db = getDb()
    const row = db.prepare(`SELECT blob_url FROM runs WHERE id = ?`).get(id) as { blob_url: string | null } | undefined
    if (row?.blob_url) deleteUploadedFile(row.blob_url)
    db.prepare(`DELETE FROM runs WHERE id = ?`).run(id)
  } catch (err) {
    console.error('[db] deleteRun error:', err)
  }
}
