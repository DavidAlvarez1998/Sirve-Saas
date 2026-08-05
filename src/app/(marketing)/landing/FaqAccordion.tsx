'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const FAQS = [
  {
    q: '¿Qué es Sirva?',
    a: 'Sirva es una plataforma de gestión para restaurantes que conecta a todo tu equipo en tiempo real: mozos, cocina, administración y más. Todo desde un solo lugar, en la nube.',
  },
  {
    q: '¿Cómo funciona?',
    a: 'Creás tu cuenta gratis, configurás tu restaurante, y en minutos tu equipo puede empezar a tomar pedidos. Cada rol (mozo, cocina, admin) accede solo a lo que necesita.',
  },
  {
    q: '¿Cuánto cuesta?',
    a: 'El plan Gratis incluye las funciones esenciales sin cargo. Si tu operación crece y necesitás más, el plan Pro se adapta a vos — consultanos para conocer las opciones.',
  },
  {
    q: '¿Puedo cancelar en cualquier momento?',
    a: 'Sí. No hay contratos de permanencia. Podés cancelar o cambiar de plan cuando quieras desde tu panel de administración.',
  },
  {
    q: '¿Necesito instalar algo?',
    a: 'No. Sirva funciona completamente en el navegador, desde cualquier dispositivo. Sin instalaciones, sin actualizaciones manuales.',
  },
] as const

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="divide-y divide-border">
      {FAQS.map(({ q, a }, i) => (
        <div key={i}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between py-5 text-left text-foreground font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={open === i}
          >
            <span>{q}</span>
            <ChevronDown
              className={cn(
                'w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200',
                open === i && 'rotate-180',
              )}
            />
          </button>
          {open === i && (
            <p className="pb-5 text-muted-foreground text-sm leading-relaxed">{a}</p>
          )}
        </div>
      ))}
    </div>
  )
}
