import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AppError } from './errors'

export function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status })
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.statusCode, err.message)
    }
    console.error('[handle] Unhandled error:', err)
    return apiError(500, 'Internal server error')
  }
}

export interface Actor {
  username: string
  roles: string[]
  tenantId: string | null
}

export function getContext(req: NextRequest): {
  tenantSlug: string
  user: Actor
} {
  const tenantSlug = req.headers.get('x-tenant-slug') ?? ''
  const userRaw = req.headers.get('x-user') ?? '{}'
  let user: Actor = { username: '', roles: [], tenantId: null }
  try {
    user = JSON.parse(userRaw) as Actor
  } catch {
    // malformed header — middleware should have blocked this, but degrade gracefully
  }
  return { tenantSlug, user }
}
