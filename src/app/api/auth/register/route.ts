import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { handle, apiSuccess } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import { RegisterSchema } from '@/lib/schemas'
import { register } from '@/lib/services/auth'
import { rateLimit } from '@/lib/rate-limit'

// 5 registration attempts per IP per hour
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(`register:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ message: 'Demasiados intentos. Intentá de nuevo en una hora.' }, { status: 429 })
  }

  return handle(async () => {
    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')
    }

    // Strip client-only fields before passing to service
    const { confirmPassword: _c, acceptTerms: _t, ...serviceInput } = parsed.data

    const sql = masterDb()
    const result = await register(sql, serviceInput)

    return apiSuccess(result, 201)
  })
}
