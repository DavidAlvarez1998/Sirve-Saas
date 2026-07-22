import type { NextRequest } from 'next/server'
import { handle, apiSuccess } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import * as ImagenesService from '@/lib/services/imagenes'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  return handle(async () => {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) throw new ValidationError('Missing file field')
    const result = await ImagenesService.subirImagen(file)
    return apiSuccess(result, 201)
  })
}
