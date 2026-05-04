import { deleteRun } from '@/lib/db'

export async function DELETE(
  _: Request,
  { params }: { params: { id: string } },
) {
  try {
    await deleteRun(params.id)
    return new Response(null, { status: 204 })
  } catch (err: unknown) {
    console.error('[history DELETE]', err)
    return Response.json({ error: 'Failed to delete run.' }, { status: 500 })
  }
}
