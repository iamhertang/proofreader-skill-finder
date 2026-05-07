/**
 * Local disk storage — replaces Vercel Blob for sandbox usage.
 * Uploaded .xlsx files are saved to <project>/data/uploads/
 * and served via the /api/uploads/[filename] route.
 */
import fs from 'fs'
import path from 'path'

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads')

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
}

/**
 * Saves a file buffer to disk and returns the local URL path.
 * Returns a path like /api/uploads/1234567890-myfile.xlsx
 */
export async function saveUploadedFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<string> {
  ensureDir()
  const safeName = `${Date.now()}-${filename}`
  const filePath = path.join(UPLOADS_DIR, safeName)
  fs.writeFileSync(filePath, Buffer.from(buffer))
  return `/api/uploads/${encodeURIComponent(safeName)}`
}

/**
 * Deletes an uploaded file given its URL path.
 * Silently ignores missing files.
 */
export function deleteUploadedFile(urlPath: string): void {
  try {
    const filename = decodeURIComponent(path.basename(urlPath))
    const filePath = path.join(UPLOADS_DIR, filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {
    // non-fatal
  }
}
