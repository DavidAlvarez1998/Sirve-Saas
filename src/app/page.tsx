import React from 'react'
import Link from 'next/link'
import { Users, Zap, LayoutDashboard, CheckCircle, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { FaqAccordion } from '@/app/(marketing)/landing/FaqAccordion'

// ─── Feature cards ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    Icon: Users,
    title: 'Roles y permisos',
    description:
      'Admin, Mesero, Cocina y Superadmin. Cada uno ve solo lo que necesita, sin fricciones.',
  },
  {
    Icon: Zap,
    title: 'Pedidos en tiempo real',
    description:
      'El mozo toma el pedido, la cocina lo ve al instante. Sin papel, sin demoras, sin errores.',
  },
  {
    Icon: LayoutDashboard,
    title: 'Gestión completa',
    description:
      'Productos, ingredientes, mesas y reportes en un solo lugar. Todo lo que necesitás para operar.',
  },
] as const

// ─── Before / After ───────────────────────────────────────────────────────────

const BEFORE_AFTER = [
  {
    before: 'Pedidos escritos a mano, errores frecuentes',
    after: 'Pedidos digitales al instante, sin ambigüedades',
  },
  {
    before: 'Comunicación por gritos entre sala y cocina',
    after: 'Notificaciones en tiempo real en cada estación',
  },
  {
    before: 'No sabés qué stock tenés hasta que falta algo',
    after: 'Inventario actualizado con cada pedido',
  },
  {
    before: 'Planillas de Excel para controlar el negocio',
    after: 'Reportes automáticos y dashboards en vivo',
  },
] as const

// ─── Pricing tiers ────────────────────────────────────────────────────────────

const PRICING = [
  {
    name: 'Gratis',
    price: '$0',
    period: 'para siempre',
    description: 'Todo lo esencial para arrancar sin poner la tarjeta.',
    features: [
      'Hasta 3 usuarios',
      'Gestión de pedidos básica',
      'Panel de administración',
      'Soporte por email',
    ],
    cta: 'Empezar gratis',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Pro',
    price: 'Consultanos',
    period: 'plan a medida',
    description: 'Para operaciones que crecieron y necesitan más potencia.',
    features: [
      'Usuarios ilimitados',
      'Reportes avanzados',
      'Múltiples sucursales',
      'Soporte prioritario',
    ],
    cta: 'Hablar con ventas',
    href: 'mailto:hola@sirva.app',
    highlight: true,
  },
] as const

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-xl font-bold text-primary">Sirva</span>

          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Funciones
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Precios
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Ingresar
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Registrate gratis
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="px-6 py-24 text-center max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Gestioná tu restaurante
            <br />
            <span className="text-primary">sin complicaciones</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Sirva conecta a todo tu equipo en tiempo real — desde el mozo hasta la cocina.
            Empezá hoy, gratis, sin tarjeta de crédito.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Registrate gratis
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center rounded-md border border-border bg-transparent px-8 py-3 text-sm font-semibold text-foreground hover:bg-surface transition-colors"
            >
              Ver funciones
            </a>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="px-6 py-16 bg-surface">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-4">Todo lo que necesitás</h2>
            <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
              Diseñado para restaurantes reales, con las herramientas que tu equipo usa todos los días.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map(({ Icon, title, description }) => (
                <Card key={title} className="p-6 bg-background">
                  <Icon className="w-8 h-8 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ── Before / After ── */}
        <section className="px-6 py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-4">Sin Sirva vs. con Sirva</h2>
            <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
              Vé la diferencia que hace tener todo tu equipo conectado.
            </p>
            <div className="grid grid-cols-2 gap-0 rounded-lg border border-border overflow-hidden">
              <div className="bg-surface px-5 py-3 text-sm font-semibold text-muted-foreground border-b border-border flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive shrink-0" />
                Sin Sirva
              </div>
              <div className="bg-surface px-5 py-3 text-sm font-semibold text-muted-foreground border-b border-l border-border flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                Con Sirva
              </div>
              {BEFORE_AFTER.map(({ before, after }, i) => (
                <React.Fragment key={i}>
                  <div className="px-5 py-4 text-sm text-muted-foreground border-b border-border last:border-b-0">
                    {before}
                  </div>
                  <div className="px-5 py-4 text-sm text-foreground border-b border-l border-border last:border-b-0">
                    {after}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust strip ── */}
        <section className="px-6 py-10 bg-surface border-y border-border">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase mb-2">
              Diseñado para restaurantes reales
            </p>
            <p className="text-foreground text-lg font-semibold">
              Empezá gratis hoy — sin tarjeta de crédito, sin burocracia.
            </p>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="px-6 py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-4">Precios simples</h2>
            <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
              Empezá gratis. Crecé cuando lo necesites.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {PRICING.map(({ name, price, period, description, features, cta, href, highlight }) => (
                <Card
                  key={name}
                  className={`p-8 flex flex-col gap-6 ${highlight ? 'border-primary ring-1 ring-primary' : ''}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-bold">{name}</h3>
                      {highlight && (
                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">
                          Recomendado
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-foreground">{price}</span>
                      <span className="text-sm text-muted-foreground">{period}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{description}</p>
                  </div>

                  <ul className="flex flex-col gap-2">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                        <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={href}
                    className={`mt-auto inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-semibold transition-colors ${
                      highlight
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border border-border bg-transparent text-foreground hover:bg-surface'
                    }`}
                  >
                    {cta}
                  </Link>
                </Card>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-6">
              Los precios mostrados son orientativos. Ningún cobro se procesa desde esta página.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="px-6 py-16 bg-surface">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-12">Preguntas frecuentes</h2>
            <FaqAccordion />
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="px-6 py-24 text-center bg-primary">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Empezá hoy gratis
          </h2>
          <p className="text-primary-foreground/80 mb-10 max-w-xl mx-auto">
            Sin tarjeta de crédito. Sin contratos. Tu restaurante conectado en minutos.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-md bg-background px-10 py-4 text-base font-bold text-primary hover:bg-surface transition-colors"
          >
            Registrate gratis
          </Link>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border px-6 py-8 bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© 2026 Sirva</p>
          <nav className="flex items-center gap-6">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Ingresar
            </Link>
            <Link href="/register" className="hover:text-foreground transition-colors">
              Registrate
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Términos
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacidad
            </Link>
          </nav>
        </div>
      </footer>

    </div>
  )
}
