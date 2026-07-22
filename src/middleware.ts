import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? '')
}

function apiJson(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status })
}

/**
 * Extract subdomain from Host header.
 * "pepe.localhost:3000" → "pepe"
 * "admin.example.com"  → "admin"
 * "localhost:3000"     → null
 */
function extractSubdomain(host: string): string | null {
  const match = /^([a-z0-9][a-z0-9-]*)\./.exec(host)
  return match?.[1] ?? null
}

function propagate(
  req: NextRequest,
  ctx: { tenantSlug: string; user?: { sub: string; tenantId: unknown; roles: unknown } }
): NextResponse {
  const headers = new Headers(req.headers)
  headers.set('x-tenant-slug', ctx.tenantSlug)
  if (ctx.user) headers.set('x-user', JSON.stringify(ctx.user))
  return NextResponse.next({ request: { headers } })
}

// ─── Page-level logic (existing behaviour, preserved) ────────────────────────

type SessionCookie = {
  token: string
  username: string
  roles: string[]
  tenantId: string | null
}

const PUBLIC_PAGE_PATHS = ['/login', '/403', '/setup']

const ROLE_GATES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/mesero', roles: ['MESERO'] },
  { prefix: '/cocina', roles: ['COCINA'] },
  { prefix: '/superadmin', roles: ['SUPERADMIN'] },
]

function pageMiddleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl
  const hostname = req.headers.get('host') ?? ''
  const subdomain = extractSubdomain(hostname)

  if (!subdomain) {
    // In dev, allow bare localhost to navigate freely (no tenant enforcement)
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.next()
    }
    if (pathname !== '/login') {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  if (PUBLIC_PAGE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const cookieRaw = req.cookies.get('sirve_session')?.value
  let session: SessionCookie | null = null
  if (cookieRaw) {
    try {
      session = JSON.parse(decodeURIComponent(cookieRaw)) as SessionCookie
    } catch {
      session = null
    }
  }

  if (!session?.token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('callbackUrl', pathname + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

  const gate = ROLE_GATES.find(
    g => pathname === g.prefix || pathname.startsWith(g.prefix + '/')
  )
  if (gate) {
    const hasRole = gate.roles.some(r => session!.roles.includes(r))
    if (!hasRole) {
      const url = req.nextUrl.clone()
      url.pathname = '/403'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

// ─── API public bypass paths (no JWT required) ───────────────────────────────

const API_PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/setup/',
]

function isApiPublic(pathname: string): boolean {
  return API_PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
}

// ─── Middleware entry point ───────────────────────────────────────────────────

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl
  const host = req.headers.get('host') ?? ''

  // ── Non-API routes: delegate to existing page logic ──
  if (!pathname.startsWith('/api/')) {
    return pageMiddleware(req)
  }

  // ── API: resolve tenant slug from subdomain ──
  const subdomain = extractSubdomain(host)
  let tenantSlug: string

  if (subdomain === 'admin') {
    // SUPERADMIN routes — sentinel value, cross-checked below
    tenantSlug = '__master__'
  } else if (subdomain) {
    tenantSlug = subdomain
  } else {
    // No subdomain on API call
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
      tenantSlug = '__local__'
    } else {
      return apiJson(400, 'Tenant subdomain required')
    }
  }

  // ── Public API paths: skip JWT, forward with tenant context ──
  if (isApiPublic(pathname)) {
    // Login and setup always operate in master context
    return propagate(req, { tenantSlug: '__master__' })
  }

  // ── JWT required for all other API routes ──
  const authHeader = req.headers.get('authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!bearer) {
    return apiJson(401, 'Authorization header required')
  }

  let claims: { sub: unknown; tenantId: unknown; roles: unknown }
  try {
    const { payload } = await jwtVerify(bearer, getSecret())
    claims = payload as typeof claims
  } catch {
    return apiJson(401, 'Invalid or expired token')
  }

  const roles = (claims.roles as string[]) ?? []
  const isSuperadmin = roles.includes('SUPERADMIN')

  // ── Cross-tenant guard ──
  if (tenantSlug === '__master__') {
    // admin.* subdomain: only SUPERADMIN may access
    if (!isSuperadmin) {
      return apiJson(403, 'Forbidden')
    }
  } else if (tenantSlug !== '__local__') {
    // Regular tenant: JWT must belong to this tenant (SUPERADMIN exempt)
    if (!isSuperadmin && claims.tenantId !== tenantSlug) {
      return apiJson(403, 'Forbidden')
    }
  }

  return propagate(req, {
    tenantSlug,
    user: { sub: claims.sub as string, tenantId: claims.tenantId, roles: claims.roles },
  })
}

export const config = {
  // Cover both API routes and page routes (excluding Next.js internals and favicon)
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}
