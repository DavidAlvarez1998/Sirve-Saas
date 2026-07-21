import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantSlug } from '@/lib/tenant'

const PUBLIC_PATHS = ['/login', '/403', '/setup']

type SessionCookie = {
  token: string
  username: string
  roles: string[]
  tenantId: string | null
}

const ROLE_GATES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/mesero', roles: ['MESERO'] },
  { prefix: '/cocina', roles: ['COCINA'] },
  { prefix: '/superadmin', roles: ['SUPERADMIN'] },
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const hostname = req.headers.get('host') ?? ''

  // 1. Tenant resolution — every request needs a subdomain
  const tenantSlug = resolveTenantSlug(hostname)
  if (!tenantSlug) {
    // Bare "localhost" or IP — no tenant. Redirect to login (surfaces the error).
    if (pathname !== '/login') {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // 2. Public paths bypass auth
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // 3. Read and parse session cookie
  const cookieRaw = req.cookies.get('restaurant_session')?.value
  let session: SessionCookie | null = null
  if (cookieRaw) {
    try {
      session = JSON.parse(decodeURIComponent(cookieRaw)) as SessionCookie
    } catch {
      session = null
    }
  }

  // 4. No session → redirect to login with callbackUrl
  if (!session?.token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('callbackUrl', pathname + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // 5. RBAC — check role gate for pathname
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

export const config = {
  matcher: [
    // Match all paths except _next static, _next image, favicon, and /api proxy
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}
