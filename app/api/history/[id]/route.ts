import { deleteRun } from '@/lib/db'

export async function DELETE(
  _: Request,
  { params }: { params: { id: string } },
) {
  try {
    await deleteRun(params.id)
    return new Response(null, { status: 204 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete run.'
    return Response.json({ error: message }, { status: 500 })
  }
}
