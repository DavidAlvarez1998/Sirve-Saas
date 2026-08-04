import { Resend } from 'resend'

export async function sendInvitationEmail(params: {
  to: string
  tenantNombre: string
  setupUrl: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping invitation email')
    return
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'noreply@sirve.app',
    to: params.to,
    subject: `Invitación para configurar ${params.tenantNombre} en Sirva`,
    html: `<p>Hacé click en el siguiente link para completar la configuración:</p><a href="${params.setupUrl}">${params.setupUrl}</a>`,
  })
}
