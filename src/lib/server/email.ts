import { Resend } from 'resend'

let client: Resend | null = null
function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!client) client = new Resend(apiKey)
  return client
}

const FROM = process.env.RESEND_FROM_EMAIL || 'Bis Repetita <reservations@bisrepetita.ch>'

// Best-effort, ne lève jamais — un email raté ne doit jamais faire échouer une réservation/un
// paiement. Si RESEND_API_KEY n'est pas configuré (ex: environnement de dev sans clé), l'envoi
// est simplement ignoré (log console) plutôt que de bloquer.
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const resend = getClient()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY manquant — email non envoyé:', opts.subject, '→', opts.to)
    return
  }
  try {
    await resend.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html })
  } catch (err) {
    console.error('[email] échec envoi:', opts.subject, '→', opts.to, err)
  }
}
