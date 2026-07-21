import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8080'

async function handler(req: NextRequest, ctx: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await ctx.params
  const path = proxy.join('/')
  const search = req.nextUrl.search
  const targetUrl = `${BACKEND}/api/${path}${search}`

  // Preserve original browser Host — this is how the backend resolves the tenant
  const originalHost = req.headers.get('host') ?? ''

  // Copy headers, replacing Host with the original browser value
  const forwardHeaders = new Headers(req.headers)
  forwardHeaders.set('host', originalHost)
  // Remove hop-by-hop headers Next may have injected
  forwardHeaders.delete('connection')
  forwardHeaders.delete('content-length') // fetch recomputes

  const method = req.method
  const hasBody = method !== 'GET' && method !== 'HEAD'

  const backendResponse = await fetch(targetUrl, {
    method,
    headers: forwardHeaders,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
    // @ts-expect-error — undici supports duplex in Node runtime
    duplex: hasBody ? 'half' : undefined,
  })

  // Stream response back, strip hop-by-hop headers
  const respHeaders = new Headers(backendResponse.headers)
  respHeaders.delete('transfer-encoding')

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: respHeaders,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
