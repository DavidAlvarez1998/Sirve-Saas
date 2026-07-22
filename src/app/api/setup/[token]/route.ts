import type { NextRequest } from 'next/server'
import { handle, apiSuccess } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import { CompletarSetupSchema } from '@/lib/schemas'
import { getInvitacion, completarSetup } from '@/lib/services/setup'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  return handle(async () => {
    const { token } = await params
    const sql = masterDb()
    const info = await getInvitacion(sql, token)
    return apiSuccess(info)
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  return handle(async () => {
    const { token } = await params
    const body = await req.json()
    const parsed = CompletarSetupSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const sql = masterDb()
    await completarSetup(sql, token, parsed.data)

    return apiSuccess({ mensaje: 'Setup completado exitosamente' })
  })
}
