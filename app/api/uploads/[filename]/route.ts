/**
 * Serves locally-stored uploaded .xlsx files.
 * Files are saved to <project>/data/uploads/ by lib/storage.ts
 */
import fs from 'fs'
import path from 'path'

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads')

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } },
) {
  const filename = decodeURIComponent(params.filename)

  // Prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return new Response('Invalid filename', { status: 400 })
  }

  const filePath = path.join(UPLOADS_DIR, filename)

  if (!fs.existsSync(filePath)) {
    return new Response('File not found', { status: 404 })
  }

  const buffer = fs.readFileSync(filePath)
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace(/^\d+-/, '')}"`,
    },
  })
}
