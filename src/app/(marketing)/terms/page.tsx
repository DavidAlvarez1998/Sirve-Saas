import Link from 'next/link'

export const metadata = {
  title: 'Términos de Servicio — Sirva',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block"
        >
          ← Volver al inicio
        </Link>

        <h1 className="text-3xl font-bold text-foreground mb-2">Términos de Servicio</h1>
        <p className="text-sm text-muted-foreground mb-10">Última actualización: agosto 2026</p>

        <div className="flex flex-col gap-8 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Uso del Servicio</h2>
            <p>
              Al acceder y usar Sirva, aceptás estos términos en su totalidad. El servicio está
              destinado a restaurantes y negocios de gastronomía que deseen gestionar sus pedidos,
              mesas y operaciones de manera digital. Debés ser mayor de 18 años para crear una
              cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Responsabilidades del Usuario</h2>
            <p>
              Sos responsable de mantener la confidencialidad de tus credenciales de acceso y de
              todas las actividades que ocurran bajo tu cuenta. Debés notificarnos inmediatamente
              ante cualquier uso no autorizado.
            </p>
            <p className="mt-3">
              No podés usar el servicio para actividades ilegales, fraudulentas o que violen derechos
              de terceros. Nos reservamos el derecho de suspender cuentas que incumplan estas
              condiciones.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Propiedad Intelectual</h2>
            <p>
              Todos los derechos sobre la plataforma Sirva, incluyendo software, diseño y contenido
              generado por nosotros, son propiedad de Sirva. Los datos de tu negocio son tuyos y
              podés exportarlos en cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Pagos y Facturación</h2>
            <p>
              Los planes de pago se detallan en la página de precios. Los cobros son mensuales y
              anticipados. No realizamos devoluciones por períodos parciales salvo obligación legal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Limitación de Responsabilidad</h2>
            <p>
              Sirva se provee &quot;tal cual es&quot;, sin garantías de disponibilidad ininterrumpida.
              No somos responsables por pérdidas de datos derivadas de fallos del servicio más allá
              de nuestra capacidad razonable de control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Modificaciones</h2>
            <p>
              Podemos actualizar estos términos con un aviso de al menos 30 días. El uso continuado
              del servicio después de la fecha de vigencia implica aceptación de los nuevos términos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Contacto</h2>
            <p>
              Para consultas sobre estos términos, escribinos a{' '}
              <a
                href="mailto:legal@sirva.app"
                className="text-foreground underline underline-offset-2 hover:text-foreground/70"
              >
                legal@sirva.app
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex gap-6 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Política de Privacidad
          </Link>
          <Link href="/" className="hover:text-foreground transition-colors">
            Inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
