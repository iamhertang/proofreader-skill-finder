'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { LANGUAGES, type LanguageCode, type Stats, type SSEEvent } from '@/lib/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = [
  { step: 1, label: 'Parsing Excel' },
  { step: 2, label: 'Validating columns' },
  { step: 3, label: 'Computing diffs' },
  { step: 4, label: 'Classifying content types' },
  { step: 5, label: 'Sending to LLM for analysis' },
  { step: 6, label: 'Generating Skill file' },
  { step: 7, label: 'Done!' },
]

// Step 5 is the slow LLM call — show a patience hint after this many seconds
const LLM_PATIENCE_THRESHOLD_S = 8

type AppState = 'idle' | 'running' | 'done' | 'error'

interface StepState {
  status: 'pending' | 'active' | 'done'
  label: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-2.5 rounded-2xl ${color}`}>
      <span className="text-lg font-black">{value}</span>
      <span className="text-xs font-semibold mt-0.5 opacity-80">{label}</span>
    </div>
  )
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [language, setLanguage] = useState<LanguageCode>('EN')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [appState, setAppState] = useState<AppState>('idle')
  const [steps, setSteps] = useState<StepState[]>(
    STEPS.map((s) => ({ status: 'pending', label: s.label })),
  )
  const [pct, setPct] = useState(0)
  const [activeStep, setActiveStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{ skillMd: string; stats: Stats } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Elapsed timer ──────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed((s) => s + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => stopTimer(), [stopTimer])

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback((incoming: File) => {
    setFileError(null)
    if (!incoming.name.endsWith('.xlsx')) {
      setFileError('Only .xlsx files are accepted.')
      setFile(null)
      return
    }
    if (incoming.size > 50 * 1024 * 1024) {
      setFileError('File size must be under 50 MB.')
      setFile(null)
      return
    }
    setFile(incoming)
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) handleFile(dropped)
    },
    [handleFile],
  )

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0]
      if (picked) handleFile(picked)
    },
    [handleFile],
  )

  // ── Run pipeline ───────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!file) return

    setAppState('running')
    setErrorMsg(null)
    setResult(null)
    setPct(0)
    setActiveStep(0)
    setSteps(STEPS.map((s) => ({ status: 'pending', label: s.label })))
    startTimer()

    const formData = new FormData()
    formData.append('file', file)
    formData.append('language', language)

    // AbortController lets us cancel the fetch (and stop the LLM call) as soon
    // as we receive a terminal event (error or pct=100), preventing the while
    // loop from spinning forever and consuming extra tokens.
    const abortCtrl = new AbortController()

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
        signal: abortCtrl.signal,
      })

      if (!response.body) throw new Error('No response body from server.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false

      while (!finished) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: SSEEvent
          try {
            event = JSON.parse(line.slice(6))
          } catch {
            continue
          }

          if (event.error) {
            stopTimer()
            setErrorMsg(event.error)
            setAppState('error')
            finished = true   // exit the while loop
            abortCtrl.abort() // cancel the fetch/stream
            break             // exit the for loop
          }

          if (event.pct !== undefined) {
            setPct(event.pct)
          }

          if (event.step !== undefined) {
            setActiveStep(event.step)
            const stepIdx = event.step - 1
            setSteps((prev) =>
              prev.map((s, i) => {
                if (i < stepIdx) return { ...s, status: 'done' }
                if (i === stepIdx) return { ...s, status: 'active', label: event.label ?? s.label }
                return s
              }),
            )
          }

          if (event.pct === 100 && event.result && event.stats) {
            stopTimer()
            setPct(100)
            setSteps(STEPS.map((s) => ({ status: 'done', label: s.label })))
            setResult({ skillMd: event.result, stats: event.stats })
            setAppState('done')
            finished = true   // exit the while loop
            abortCtrl.abort() // cancel the fetch/stream
            break             // exit the for loop
          }
        }
      }
    } catch (err: unknown) {
      // AbortError is expected when we call abortCtrl.abort() — not a real error
      if (err instanceof Error && err.name === 'AbortError') return
      stopTimer()
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setErrorMsg(msg)
      setAppState('error')
    }
  }

  const handleReset = () => {
    stopTimer()
    setAppState('idle')
    setFile(null)
    setFileError(null)
    setResult(null)
    setErrorMsg(null)
    setPct(0)
    setActiveStep(0)
    setElapsed(0)
    setSteps(STEPS.map((s) => ({ status: 'pending', label: s.label })))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const downloadMd = () => {
    if (!result) return
    const blob = new Blob([result.skillMd], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `skill-${language.toLowerCase()}-${Date.now()}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  const downloadTemplate = async () => {
    const a = document.createElement('a')
    a.href = '/api/template'
    a.download = 'TranslationDatasetTemplate.xlsx'
    a.click()
  }

  // Patience hint: show when stuck on LLM step for a while
  const showPatienceHint = appState === 'running' && activeStep === 5 && elapsed >= LLM_PATIENCE_THRESHOLD_S

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">
          Proofreader Skill Finder
        </h1>
        <p className="text-slate-500 text-lg font-semibold">
          Turn human correction data into an AI proofreading skill file ✨
        </p>
        <p className="text-slate-400 text-sm font-medium max-w-xl mx-auto leading-relaxed">
          Upload your translation dataset. Extract correction patterns, surface human inconsistencies, and generate a Skill file your proofreading AI agent can use immediately.
        </p>
      </div>

      {/* Setup Card */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-7">
        {/* Language Selector */}
        <div className="flex items-center gap-3">
          <span className="px-4 py-2 rounded-2xl bg-slate-100 text-slate-500 font-extrabold text-sm tracking-wide">
            CHS
          </span>
          <span className="text-slate-400 font-black text-lg">→</span>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="appearance-none px-4 pr-8 py-2 rounded-2xl bg-coral text-white font-extrabold text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-coral/50 shadow-md shadow-coral/20"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.code}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/80 text-xs">
              ▾
            </span>
          </div>
        </div>

        {/* File upload — full width */}
        <div className="space-y-2">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`cursor-pointer w-full px-5 py-6 rounded-2xl border-2 border-dashed text-center transition-all duration-150 ${
              isDragging
                ? 'border-seafoam bg-seafoam/10'
                : file
                ? 'border-mint bg-mint/10'
                : fileError
                ? 'border-red-300 bg-red-50'
                : 'border-slate-200 bg-slate-50 hover:border-seafoam hover:bg-seafoam/5'
            }`}
          >
            {file ? (
              <div className="space-y-0.5">
                <div className="text-2xl">📊</div>
                <div className="font-bold text-slate-700 text-sm truncate max-w-full">{file.name}</div>
                <div className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB · Click to replace
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-2xl">☁️</div>
                <div className="font-bold text-slate-500 text-sm">
                  Drop your .xlsx here or click to browse
                </div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={onFileInput}
          />
          {fileError && (
            <p className="text-xs text-red-500 font-semibold">⚠️ {fileError}</p>
          )}
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={!file || appState === 'running'}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-seafoam text-white font-extrabold text-lg transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-seafoam/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
        >
          {appState === 'running' ? (
            <>
              <span className="animate-spin">⚙️</span>
              <span>Analysing…</span>
            </>
          ) : (
            <>
              <span>🚀</span>
              <span>Run Analysis</span>
            </>
          )}
        </button>

        {/* Download Template — secondary, below run */}
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-sm transition-all duration-150 hover:-translate-y-0.5"
          >
            <span>📥</span>
            <span>Download Template</span>
          </button>
          <span className="text-slate-300 text-xs">·</span>
          <span className="text-xs text-slate-400">TextID, CHS, Target, Target (PR), EXTRA</span>
        </div>
      </div>

      {/* Progress Section */}
      {(appState === 'running' || appState === 'done' || appState === 'error') && (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-6">

          {/* Header row: title + elapsed timer */}
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-slate-800 text-xl">Pipeline Progress</h2>
            {appState === 'running' && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-seafoam/10 border border-seafoam/20">
                {/* Heartbeat dot */}
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-seafoam opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-seafoam" />
                </span>
                <span className="text-xs font-bold text-teal-700 tabular-nums">
                  {formatElapsed(elapsed)}
                </span>
              </div>
            )}
            {appState === 'done' && (
              <span className="text-xs font-bold text-teal-600 bg-mint/20 px-3 py-1.5 rounded-full">
                Completed in {formatElapsed(elapsed)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Progress</span>
              <span className="text-xs font-black text-slate-600 tabular-nums">{pct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full relative overflow-hidden transition-all duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  background: appState === 'done'
                    ? 'linear-gradient(90deg, #4ecca3, #38b2ac)'
                    : 'linear-gradient(90deg, #4eccca, #4ecca3)',
                }}
              >
                {/* Shimmer overlay — only while running */}
                {appState === 'running' && (
                  <span className="absolute inset-0 progress-shimmer" />
                )}
              </div>
            </div>
          </div>

          {/* Patience hint for LLM step */}
          {showPatienceHint && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
              <span className="text-xl mt-0.5">🧠</span>
              <div>
                <p className="text-sm font-bold text-amber-800">LLM is thinking…</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  The AI is analysing your correction data. This can take up to 2 minutes — please don&apos;t close the tab.
                </p>
              </div>
            </div>
          )}

          {/* Step list */}
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-4">
                {/* Dot */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 transition-all duration-300 ${
                    s.status === 'done'
                      ? 'bg-mint text-white'
                      : s.status === 'active'
                      ? 'bg-seafoam text-white step-active'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {s.status === 'done' ? '✓' : i + 1}
                </div>
                {/* Label */}
                <span
                  className={`font-bold text-sm transition-colors duration-300 ${
                    s.status === 'done'
                      ? 'text-slate-400 line-through'
                      : s.status === 'active'
                      ? 'text-seafoam'
                      : 'text-slate-300'
                  }`}
                >
                  {s.label}
                </span>
                {/* Spinner on active step */}
                {s.status === 'active' && appState === 'running' && (
                  <span className="ml-auto text-seafoam animate-spin text-base">⚙️</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Error */}
      {appState === 'error' && errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-6 space-y-3">
          <p className="font-bold text-red-700 mb-2">⚠️ Analysis failed</p>
          <pre className="text-sm text-red-800 bg-red-100 rounded-xl p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">{errorMsg}</pre>
          <button
            onClick={handleReset}
            className="px-5 py-2 rounded-full bg-red-100 hover:bg-red-200 text-red-700 font-bold text-sm transition-all"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Results */}
      {appState === 'done' && result && (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-7">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="font-extrabold text-slate-800 text-xl">Results</h2>
            <div className="flex gap-3">
              <button
                onClick={downloadMd}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gold text-amber-900 font-extrabold text-sm hover:bg-yellow-300 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
              >
                <span>⬇️</span>
                <span>Download .md</span>
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-all duration-150"
              >
                New Run
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <StatChip
              label="Total Rows"
              value={result.stats.total}
              color="bg-slate-100 text-slate-700"
            />
            <StatChip
              label="Accepted"
              value={`${result.stats.accepted} (${Math.round((result.stats.accepted / result.stats.total) * 100)}%)`}
              color="bg-mint/30 text-teal-800"
            />
            <StatChip
              label="Word Swap"
              value={result.stats.wordSwap}
              color="bg-sky-100 text-sky-800"
            />
            <StatChip
              label="Restructured"
              value={result.stats.phraseRestructure}
              color="bg-violet-100 text-violet-800"
            />
            <StatChip
              label="Full Rewrite"
              value={result.stats.fullRewrite}
              color="bg-coral/20 text-rose-800"
            />
          </div>

          {/* Content types */}
          <div className="flex flex-wrap gap-2">
            {(Object.entries(result.stats.contentTypes) as [string, number][])
              .filter(([, n]) => n > 0)
              .map(([type, n]) => (
                <span
                  key={type}
                  className="px-3 py-1 rounded-full bg-gold/40 text-amber-900 text-xs font-bold"
                >
                  {type} · {n}
                </span>
              ))}
          </div>

          {/* Skill file preview */}
          <div className="space-y-2">
            <p className="font-extrabold text-slate-700 text-sm uppercase tracking-widest">
              Skill File Preview
            </p>
            <pre className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-700 overflow-auto max-h-96 scrollbar-thin font-mono leading-relaxed whitespace-pre-wrap">
              {result.skillMd}
            </pre>
          </div>

          <p className="text-xs text-slate-400 font-medium text-center">
            This run has been auto-saved to your history. 🕐
          </p>
        </div>
      )}
    </div>
  )
}
