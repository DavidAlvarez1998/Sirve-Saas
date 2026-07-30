import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? '')
}

function apiJson(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status })
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

// ─── Page-level logic ────────────────────────────────────────────────────────

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

async function pageMiddleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

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

  // Verify JWT signature — cookie JSON is client-controlled, signature is not
  try {
    await jwtVerify(session.token, getSecret())
  } catch {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    req.cookies.delete('sirve_session')
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

  // ── Non-API routes: delegate to page logic ──
  if (!pathname.startsWith('/api/')) {
    return pageMiddleware(req)
  }

  // ── Public API paths: skip JWT, forward with master context ──
  if (isApiPublic(pathname)) {
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

  // tenantSlug is authoritative from the signed JWT — no cross-check needed
  const tenantSlug = (claims.tenantId as string | null) ?? '__master__'

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
