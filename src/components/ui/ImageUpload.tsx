'use client'

import { useRef, useState, useEffect } from 'react'
import { Camera, X } from 'lucide-react'

interface ImageUploadProps {
  value: string | null
  onChange: (file: File | null) => void
  label?: string
}

export default function ImageUpload({ value, onChange, label = 'Imagen' }: ImageUploadProps) {
  const ref = useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  useEffect(() => {
    setLocalPreview(null)
  }, [value])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLocalPreview(URL.createObjectURL(file))
    onChange(file)
    e.target.value = ''
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLocalPreview(null)
    onChange(null)
  }

  const displaySrc = localPreview ?? value

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</label>
      <div
        onClick={() => ref.current?.click()}
        className="relative w-full h-36 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 overflow-hidden cursor-pointer hover:border-orange-400 transition bg-slate-200 dark:bg-slate-700 flex items-center justify-center"
      >
        {displaySrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displaySrc} alt="preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <div className="text-center text-slate-500">
            <Camera size={28} className="mx-auto mb-1" />
            <span className="text-xs">Toca para agregar foto</span>
          </div>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
