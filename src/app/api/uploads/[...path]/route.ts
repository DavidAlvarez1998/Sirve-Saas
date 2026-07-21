import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8080'

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const filePath = path.join('/')
  const targetUrl = `${BACKEND}/uploads/${filePath}`

  const originalHost = req.headers.get('host') ?? ''
  const forwardHeaders = new Headers(req.headers)
  forwardHeaders.set('host', originalHost)
  forwardHeaders.delete('connection')

  const backendResponse = await fetch(targetUrl, {
    method: req.method,
    headers: forwardHeaders,
    redirect: 'manual',
  })

  const respHeaders = new Headers(backendResponse.headers)
  respHeaders.delete('transfer-encoding')

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: respHeaders,
  })
}

export const GET = handler
export const HEAD = handler
