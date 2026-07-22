import { supabaseAdmin } from './supabase-admin'
import { ValidationError } from './errors'

const BUCKET = 'imagenes-productos'

export async function uploadImage(file: File): Promise<{ url: string }> {
  if (!file.type.startsWith('image/')) {
    throw new ValidationError('File must be an image (image/* MIME type)')
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const name = `${crypto.randomUUID()}.${ext}`

  const buffer = await file.arrayBuffer()
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(name, buffer, { contentType: file.type })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(name)
  return { url: data.publicUrl }
}
