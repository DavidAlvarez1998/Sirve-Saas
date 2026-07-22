import type { NextRequest } from 'next/server'
import { handle, apiSuccess } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import { LoginSchema } from '@/lib/schemas'
import { login } from '@/lib/services/auth'

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json()
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const sql = masterDb()
    const result = await login(sql, parsed.data)

    return apiSuccess(result)
  })
}
