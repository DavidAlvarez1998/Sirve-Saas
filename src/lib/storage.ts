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
    .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer()

  const name = `${crypto.randomUUID()}.webp`

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(name, optimized, { contentType: 'image/webp' })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(name)
  return { url: data.publicUrl }
}

export async function deleteImage(url: string): Promise<void> {
  const prefix = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(prefix)
  if (idx === -1) return
  const name = url.slice(idx + prefix.length)
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([name])
  if (error) throw new Error(`Storage delete failed: ${error.message}`)
}
