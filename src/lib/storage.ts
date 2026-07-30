import sharp from 'sharp'
import { supabaseAdmin } from './supabase-admin'
import { ValidationError } from './errors'

const BUCKET = 'imagenes-productos'

export async function uploadImage(file: File): Promise<{ url: string }> {
  if (!file.type.startsWith('image/')) {
    throw new ValidationError('File must be an image (image/* MIME type)')
  }

  const raw = Buffer.from(await file.arrayBuffer())
  const optimized = await sharp(raw)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()

  const name = `${crypto.randomUUID()}.webp`

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(name, optimized, { contentType: 'image/webp' })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(name)
  return { url: data.publicUrl }
}
