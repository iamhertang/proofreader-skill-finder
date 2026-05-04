import { buildTemplate } from '@/lib/excel'

export async function GET() {
  const buffer = buildTemplate()

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="TranslationDatasetTemplate.xlsx"',
    },
  })
}
