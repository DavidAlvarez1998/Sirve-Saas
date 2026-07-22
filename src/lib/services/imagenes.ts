import { ValidationError } from '@/lib/errors'
import { uploadImage } from '@/lib/storage'

export async function subirImagen(file: File): Promise<{ url: string }> {
  if (!file.type.startsWith('image/')) throw new ValidationError('Solo se permiten imágenes')
  if (file.size > 5 * 1024 * 1024) throw new ValidationError('Imagen demasiado grande (máx 5MB)')
  return uploadImage(file)
}
