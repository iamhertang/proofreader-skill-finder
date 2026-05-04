import * as XLSX from 'xlsx'
import type { Row } from './types'

const REQUIRED_COLUMNS = ['TextID', 'CHS', 'Target', 'Target (PR)', 'EXTRA']

type ParseResult =
  | { rows: Row[]; error?: never }
  | { rows?: never; error: string }

export function parseAndValidate(buffer: ArrayBuffer): ParseResult {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch {
    return { error: 'Failed to read the file. Make sure it is a valid .xlsx file.' }
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })

  if (raw.length === 0) {
    return { error: 'The spreadsheet appears to be empty.' }
  }

  const headers = Object.keys(raw[0])
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col))
  if (missing.length > 0) {
    return {
      error: `Missing columns: ${missing.map((c) => `"${c}"`).join(', ')}. All five columns are required: ${REQUIRED_COLUMNS.join(', ')}.`,
    }
  }

  const rows: Row[] = raw
    .map((r) => ({
      textId: String(r['TextID'] ?? '').trim(),
      chs: String(r['CHS'] ?? '').trim(),
      target: String(r['Target'] ?? '').trim(),
      targetPR: String(r['Target (PR)'] ?? '').trim(),
      extra: String(r['EXTRA'] ?? '').trim(),
    }))
    .filter((r) => r.textId || r.chs)

  if (rows.length === 0) {
    return { error: 'No data rows found. The file contains only a header row.' }
  }

  return { rows }
}

export function buildTemplate(): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['TextID', 'CHS', 'Target', 'Target (PR)', 'EXTRA'],
  ])

  ws['!cols'] = [
    { wch: 22 },
    { wch: 32 },
    { wch: 32 },
    { wch: 32 },
    { wch: 28 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Localisation Data')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
