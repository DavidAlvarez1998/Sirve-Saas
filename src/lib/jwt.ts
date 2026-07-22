import { SignJWT, jwtVerify } from 'jose'

export interface JwtPayload {
  sub: string
  tenantId: string | null
  roles: string[]
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(secret)
}

function getExpirationHours(): number {
  const raw = process.env.JWT_EXPIRATION_HOURS
  if (!raw) return 8
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) ? 8 : parsed
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  const hours = getExpirationHours()
  return new SignJWT({
    tenantId: payload.tenantId,
    roles: payload.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(getSecret())
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return {
      sub: payload.sub as string,
      tenantId: (payload.tenantId as string | null) ?? null,
      roles: (payload.roles as string[]) ?? [],
    }
  } catch {
    return null
  }
}
