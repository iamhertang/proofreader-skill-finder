'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { RunRecord } from '@/lib/types'
import { LANGUAGES } from '@/lib/types'

const FLAG_MAP = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.flag]))

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function HistoryCard({
  run,
  onDelete,
}: {
  run: RunRecord
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetch(`/api/history/${run.id}`, { method: 'DELETE' })
      onDelete(run.id)
    } catch {
      setDeleting(false)
    }
  }

  const downloadMd = () => {
    const blob = new Blob([run.skillMd], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `skill-${run.language.toLowerCase()}-${run.id.slice(0, 8)}.md`
    a.click()
    // Delay revocation so browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  const { stats } = run
  const pctAccepted = Math.round((stats.accepted / stats.total) * 100)

  return (
    <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-6 space-y-5 relative">
      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 transition-all text-sm font-bold disabled:opacity-40"
        aria-label="Delete run"
      >
        ×
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 pr-8">
        <div className="text-3xl">{FLAG_MAP[run.language] ?? '🌐'}</div>
        <div className="space-y-0.5">
          <p className="font-extrabold text-slate-800 text-base">
            CHS → {run.language}
          </p>
          <p className="text-sm text-slate-500 font-medium truncate max-w-xs">
            {run.filename}
          </p>
          <p className="text-xs text-slate-400">{formatDate(run.createdAt)}</p>
        </div>
      </div>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
          {stats.total} rows
        </span>
        <span className="px-3 py-1 rounded-full bg-mint/30 text-teal-800 text-xs font-bold">
          {stats.accepted} accepted ({pctAccepted}%)
        </span>
        <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-bold">
          {stats.wordSwap} word swap
        </span>
        <span className="px-3 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-bold">
          {stats.phraseRestructure} restructured
        </span>
        <span className="px-3 py-1 rounded-full bg-coral/20 text-rose-800 text-xs font-bold">
          {stats.fullRewrite} rewritten
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={downloadMd}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gold/50 hover:bg-gold text-amber-900 font-bold text-sm transition-all hover:-translate-y-0.5"
        >
          <span>📄</span>
          <span>Download .md</span>
        </button>

        {run.blobUrl && (
          <a
            href={run.blobUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-seafoam/20 hover:bg-seafoam/40 text-teal-800 font-bold text-sm transition-all hover:-translate-y-0.5"
          >
            <span>📊</span>
            <span>Download .xlsx</span>
          </a>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-all"
        >
          <span>{expanded ? '▲' : '▼'}</span>
          <span>{expanded ? 'Hide' : 'Preview'}</span>
        </button>
      </div>

      {/* Expandable skill MD preview */}
      {expanded && (
        <div className="border-t border-slate-100 pt-4">
          <pre className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-700 overflow-auto max-h-72 scrollbar-thin font-mono leading-relaxed whitespace-pre-wrap">
            {run.skillMd}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRuns(data)
        else setFetchError(data.error ?? 'Failed to load history.')
      })
      .catch(() => setFetchError('Could not connect to the server.'))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = (id: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">History</h1>
          <p className="text-slate-500 font-semibold">
            Your last {runs.length > 0 ? runs.length : '3'} run{runs.length !== 1 ? 's' : ''}, auto-saved on completion.
          </p>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-seafoam text-white font-bold text-sm hover:bg-teal-500 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-seafoam/30"
        >
          <span>+</span>
          <span>New Run</span>
        </Link>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-4xl animate-spin">⚙️</div>
        </div>
      )}

      {!loading && fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center space-y-2">
          <p className="font-bold text-red-700">⚠️ {fetchError}</p>
          <p className="text-sm text-red-500">
            Make sure DATABASE_URL is configured in your environment variables.
          </p>
        </div>
      )}

      {!loading && !fetchError && runs.length === 0 && (
        <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-16 text-center space-y-4">
          <div className="text-6xl">📭</div>
          <h2 className="font-extrabold text-slate-700 text-xl">No runs yet</h2>
          <p className="text-slate-400 font-medium">
            Go run your first analysis and the results will appear here automatically!
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-coral text-white font-bold hover:bg-rose-500 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-coral/30"
          >
            <span>🚀</span>
            <span>Start Here</span>
          </Link>
        </div>
      )}

      {!loading && !fetchError && runs.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {runs.map((run) => (
            <HistoryCard key={run.id} run={run} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
