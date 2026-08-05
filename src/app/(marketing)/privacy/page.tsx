import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidad — Sirva',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block"
        >
          ← Volver al inicio
        </Link>

        <h1 className="text-3xl font-bold text-foreground mb-2">Política de Privacidad</h1>
        <p className="text-sm text-muted-foreground mb-10">Última actualización: agosto 2026</p>

        <div className="flex flex-col gap-8 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Datos que Recopilamos</h2>
            <p>
              Recopilamos la información que nos proporcionás al registrarte: nombre completo, dirección
              de email, nombre del restaurante y contraseña (almacenada con hash seguro). También
              recopilamos datos de uso del servicio para mejorar la experiencia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Uso de la Información</h2>
            <p>
              Usamos tus datos para proveer el servicio, enviarte notificaciones relevantes de tu
              cuenta y mejorar la plataforma. No vendemos tu información a terceros.
            </p>
            <p className="mt-3">
              Podemos compartir datos con proveedores de infraestructura (hosting, base de datos) bajo
              acuerdos de confidencialidad estrictos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Almacenamiento y Seguridad</h2>
            <p>
              Tus datos se almacenan en servidores seguros. Las contraseñas se hashean con bcrypt y
              nunca se almacenan en texto plano. Usamos HTTPS en todas las comunicaciones.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Cookies y Almacenamiento Local</h2>
            <p>
              Usamos una cookie de sesión (<code className="text-sm bg-surface px-1 rounded">sirva_session</code>) y
              localStorage para mantener tu sesión activa. No usamos cookies de tracking de terceros
              para publicidad.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Tus Derechos</h2>
            <p>
              Podés solicitar acceso, rectificación o eliminación de tus datos en cualquier momento
              escribiéndonos a{' '}
              <a
                href="mailto:privacidad@sirva.app"
                className="text-foreground underline underline-offset-2 hover:text-foreground/70"
              >
                privacidad@sirva.app
              </a>
              . Procesamos estas solicitudes en un plazo de 30 días.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Retención de Datos</h2>
            <p>
              Mantenemos tus datos mientras tu cuenta esté activa. Al cerrar la cuenta, eliminamos
              los datos personales en un plazo de 90 días, excepto lo requerido por obligaciones
              legales o contables.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Contacto</h2>
            <p>
              Para preguntas sobre privacidad, contactanos en{' '}
              <a
                href="mailto:privacidad@sirva.app"
                className="text-foreground underline underline-offset-2 hover:text-foreground/70"
              >
                privacidad@sirva.app
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex gap-6 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Términos de Servicio
          </Link>
          <Link href="/" className="hover:text-foreground transition-colors">
            Inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
