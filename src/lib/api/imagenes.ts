import api from './axios'

export const uploadImagen = async (file: File): Promise<string> => {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post<{ url: string }>('/imagenes', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.url
}
