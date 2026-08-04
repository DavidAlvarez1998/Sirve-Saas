import Link from 'next/link'
import { Building2, Users, Zap, LayoutDashboard } from 'lucide-react'

// ─── Feature cards data ───────────────────────────────────────────────────────

const FEATURES = [
  {
    Icon: Building2,
    title: 'Multi-restaurante',
    description: 'Cada restaurante con sus datos aislados. Crecé sin límites.',
  },
  {
    Icon: Users,
    title: 'Roles y permisos',
    description: 'Admin, Mesero, Cocina y Superadmin. Cada uno ve solo lo suyo.',
  },
  {
    Icon: Zap,
    title: 'Pedidos en tiempo real',
    description: 'El mozo toma el pedido, la cocina lo ve al instante. Sin demoras.',
  },
  {
    Icon: LayoutDashboard,
    title: 'Gestión completa',
    description: 'Productos, ingredientes, mesas y reportes en un solo lugar.',
  },
] as const

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold text-primary">Sirva</span>
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Ingresar →
        </Link>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-20 text-center max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Gestioná tu restaurante
            <br />
            <span className="text-primary">sin complicaciones</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Sirva es la plataforma multi-restaurante que conecta a tu equipo en tiempo real
            — desde el mozo hasta la cocina.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Empezar ahora
          </Link>
        </section>

        {/* Features */}
        <section className="px-6 py-16 bg-surface">
          <h2 className="text-2xl font-bold text-center mb-12">Todo lo que necesitás</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {FEATURES.map(({ Icon, title, description }) => (
              <div key={title} className="bg-background rounded-lg p-6 border border-border">
                <Icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        <p>
          © {new Date().getFullYear()} Sirva ·{' '}
          <Link href="/login" className="hover:text-foreground transition-colors">
            Ingresar
          </Link>
        </p>
      </footer>
    </div>
  )
}
