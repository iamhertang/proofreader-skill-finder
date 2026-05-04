import type { DiffClass, AnalysedRow, Row } from './types'
import { inferContentType } from './content-type'

const CJK_LANGS = new Set(['JP', 'KR', 'TH', 'ZH'])

function tokenize(text: string, lang: string): string[] {
  if (CJK_LANGS.has(lang)) {
    return text.replace(/\s+/g, '').split('').filter(Boolean)
  }
  return text.trim().split(/\s+/).filter(Boolean)
}

function frequencyDiff(
  a: string[],
  b: string[],
): { added: number; removed: number; unchanged: number } {
  const aFreq: Record<string, number> = {}
  const bFreq: Record<string, number> = {}
  for (const w of a) aFreq[w] = (aFreq[w] || 0) + 1
  for (const w of b) bFreq[w] = (bFreq[w] || 0) + 1

  const allWords = new Set([...Object.keys(aFreq), ...Object.keys(bFreq)])
  let added = 0
  let removed = 0
  let unchanged = 0

  for (const w of allWords) {
    const ca = aFreq[w] || 0
    const cb = bFreq[w] || 0
    const common = Math.min(ca, cb)
    unchanged += common
    added += Math.max(0, cb - ca)
    removed += Math.max(0, ca - cb)
  }

  return { added, removed, unchanged }
}

function classifyDiff(added: number, removed: number, originalLength: number): DiffClass {
  if (added === 0 && removed === 0) return 'accepted'
  const changed = added + removed
  const denominator = originalLength + added
  const ratio = denominator > 0 ? changed / denominator : 1
  if (ratio <= 0.2) return 'word_swap'
  if (ratio <= 0.6) return 'phrase_restructure'
  return 'full_rewrite'
}

export function analyseRows(rows: Row[], lang: string): AnalysedRow[] {
  return rows.map((row) => {
    const aTokens = tokenize(row.target, lang)
    const bTokens = tokenize(row.targetPR, lang)
    const { added, removed } = frequencyDiff(aTokens, bTokens)
    const diffClass = classifyDiff(added, removed, aTokens.length)
    const contentType = inferContentType(row.textId)

    return {
      ...row,
      diffClass,
      contentType,
      changedWords: added + removed,
      totalWords: aTokens.length,
    }
  })
}
