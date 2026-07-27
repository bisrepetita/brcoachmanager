function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function layout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F9F8F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
      <p style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#7A7570;margin:0 0 16px;">Bis Repetita</p>
      <div style="background:#fff;border-radius:12px;padding:24px;">
        ${bodyHtml}
      </div>
      <p style="font-size:11px;color:#A09890;margin:16px 4px 0;">Bis Repetita · Swiss Gun Center</p>
    </div>
  </body>
</html>`
}

function infoRow(label: string, value: string, valueColor = '#1A1A18'): string {
  return `<tr>
    <td style="font-size:13px;color:#A09890;padding:4px 0;">${escapeHtml(label)}</td>
    <td style="font-size:13px;color:${valueColor};font-weight:600;text-align:right;padding:4px 0;">${escapeHtml(value)}</td>
  </tr>`
}

export function groupSessionConfirmationEmail(opts: {
  clientFirstName: string
  sessionTitle: string
  dateStr: string
  amountPaid: number
  paymentLabel: string
  accessInstructions?: string
}): { subject: string; html: string } {
  const body = `
    <p style="font-size:16px;font-weight:700;color:#1A1A18;margin:0 0 4px;">Inscription confirmée ✓</p>
    <p style="font-size:14px;color:#7A7570;margin:0 0 20px;">Salut ${escapeHtml(opts.clientFirstName)}, à très vite !</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${opts.accessInstructions ? '20px' : '0'};">
      ${infoRow('Séance', opts.sessionTitle)}
      ${infoRow('Date', opts.dateStr)}
      ${infoRow(opts.paymentLabel, `${opts.amountPaid.toFixed(2)} CHF`, '#2D7A4F')}
    </table>
    ${opts.accessInstructions ? `
    <div style="background:#F5F3F0;border-radius:8px;padding:14px;">
      <p style="font-size:13px;font-weight:600;color:#1A1A18;margin:0 0 6px;">Comment nous trouver</p>
      <p style="font-size:13px;color:#1A1A18;margin:0;white-space:pre-wrap;line-height:1.5;">${escapeHtml(opts.accessInstructions)}</p>
    </div>` : ''}
  `
  return { subject: `Inscription confirmée — ${opts.sessionTitle}`, html: layout(body) }
}

export function subscriptionConfirmationEmail(opts: {
  clientFirstName: string
  planName: string
  price: number
  endDateStr: string
}): { subject: string; html: string } {
  const body = `
    <p style="font-size:16px;font-weight:700;color:#1A1A18;margin:0 0 4px;">Abonnement activé ✓</p>
    <p style="font-size:14px;color:#7A7570;margin:0 0 20px;">Salut ${escapeHtml(opts.clientFirstName)}, ton abonnement est actif !</p>
    <table style="width:100%;border-collapse:collapse;">
      ${infoRow('Abonnement', opts.planName)}
      ${infoRow('Payé', `${opts.price.toFixed(2)} CHF`, '#2D7A4F')}
      ${infoRow('Valable jusqu\'au', opts.endDateStr)}
    </table>
  `
  return { subject: `Abonnement activé — ${opts.planName}`, html: layout(body) }
}

export function coachNewEnrollmentEmail(opts: {
  coachFirstName: string
  clientName: string
  sessionTitle: string
  dateStr: string
  paymentLabel: string
}): { subject: string; html: string } {
  const body = `
    <p style="font-size:16px;font-weight:700;color:#1A1A18;margin:0 0 4px;">Nouvelle inscription</p>
    <p style="font-size:14px;color:#7A7570;margin:0 0 20px;">Salut ${escapeHtml(opts.coachFirstName)},</p>
    <table style="width:100%;border-collapse:collapse;">
      ${infoRow('Client', opts.clientName)}
      ${infoRow('Séance', opts.sessionTitle)}
      ${infoRow('Date', opts.dateStr)}
      ${infoRow('Statut', opts.paymentLabel)}
    </table>
  `
  return { subject: `Nouvelle inscription — ${opts.sessionTitle}`, html: layout(body) }
}
