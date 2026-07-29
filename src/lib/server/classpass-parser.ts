export interface ParsedClassPassBooking {
  bookingId: string
  serviceTitle: string
  sessionDateTime: Date
  memberName: string
  memberFirstName: string
  memberLastName: string
  memberEmail: string
}

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/
const MEMBER_BLOCK_STOP = ['Détails du planning', 'Réservations ClassPass']

function valueAfterLabel(lines: string[], label: string): string | undefined {
  const idx = lines.findIndex((l) => l.trim() === label)
  if (idx === -1) return undefined
  for (let i = idx + 1; i < lines.length; i++) {
    const v = lines[i]!.trim()
    if (v) return v
  }
  return undefined
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

// Convertit une heure locale (Europe/Zurich, où se trouve le studio) en Date UTC correcte, sans
// dépendance externe — le process Node (Vercel) tourne en UTC, donc `new Date(...)` sur une chaîne
// sans fuseau donnerait une heure fausse d'1h ou 2h selon l'heure d'été.
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const asUTC = Date.UTC(year, month, day, hour, minute)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = dtf.formatToParts(new Date(asUTC))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const wallClockIfUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return new Date(asUTC - (wallClockIfUTC - asUTC))
}

// Format ClassPass observé : "Jul 29, 2026 @ 6:30 PM"
function parseClassPassDateTime(str: string): Date | null {
  const m = str.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\s*@\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!m) return null
  const [, monthStr, dayStr, yearStr, hourStr, minuteStr, ampm] = m
  const month = MONTHS[monthStr!.slice(0, 3).toLowerCase()]
  if (month === undefined) return null
  let hour = Number(hourStr)
  if (ampm!.toUpperCase() === 'PM' && hour !== 12) hour += 12
  if (ampm!.toUpperCase() === 'AM' && hour === 12) hour = 0
  return zonedTimeToUtc(Number(yearStr), month, Number(dayStr), hour, Number(minuteStr), 'Europe/Zurich')
}

// Parse le texte brut du mail "Nouvelle réservation" ClassPass. Retourne null si un champ
// essentiel manque (mail dans un format différent — annulation, rappel, etc.) plutôt que de
// deviner des valeurs partielles.
export function parseClassPassEmail(rawText: string): ParsedClassPassBooking | null {
  const lines = rawText.split(/\r?\n/)

  // Une annulation, un rappel ou une demande d'avis peut réutiliser exactement la même mise en
  // page "Détails de la réservation" (cours/date/ID/membre) — sans ce marqueur d'en-tête, on
  // refuse de parser plutôt que de risquer de traiter une annulation comme une nouvelle inscription.
  if (!lines.some((l) => l.trim() === 'Nouvelle réservation')) return null

  const serviceTitle = valueAfterLabel(lines, 'Réservation')
  const dateTimeStr = valueAfterLabel(lines, 'Date et heure')
  const bookingIdRaw = valueAfterLabel(lines, 'ID de réservation')

  const memberIdx = lines.findIndex((l) => l.trim() === 'Informations du membre')
  let memberName: string | undefined
  let memberEmail: string | undefined
  if (memberIdx !== -1) {
    for (let i = memberIdx + 1; i < lines.length; i++) {
      const v = lines[i]!.trim()
      if (!v) continue
      if (MEMBER_BLOCK_STOP.includes(v)) break
      if (EMAIL_RE.test(v)) { memberEmail = v; continue }
      if (v === 'Nouveau(elle) client(e)' || v === 'Client(e) existant(e)') continue
      if (v.length <= 2) continue // initiale de l'avatar rendue en texte seul (ex: "G")
      if (!memberName) memberName = v
    }
  }

  if (!serviceTitle || !dateTimeStr || !bookingIdRaw || !memberName || !memberEmail) return null

  const sessionDateTime = parseClassPassDateTime(dateTimeStr)
  if (!sessionDateTime) return null

  const nameParts = memberName.split(/\s+/)
  const memberFirstName = nameParts[0]!
  const memberLastName = nameParts.slice(1).join(' ')

  return {
    bookingId: bookingIdRaw.trim(),
    serviceTitle,
    sessionDateTime,
    memberName,
    memberFirstName,
    memberLastName,
    memberEmail,
  }
}

export interface ParsedClassPassCancellation {
  bookingId: string
  serviceTitle?: string
  memberName?: string
  memberEmail?: string
}

function valueAfterColon(line: string): string | undefined {
  const idx = line.indexOf(':')
  if (idx === -1) return undefined
  const v = line.slice(idx + 1).trim()
  return v || undefined
}

const CANCELLATION_HEADER = "La réservation ClassPass suivante a été annulée par l'utilisateur"

// Format ClassPass observé pour une annulation — mise en page différente du mail de nouvelle
// réservation (labels "Champ: valeur" en ligne, pas "Champ" puis valeur sur la ligne suivante).
export function parseClassPassCancellation(rawText: string): ParsedClassPassCancellation | null {
  const lines = rawText.split(/\r?\n/)
  if (!lines.some((l) => l.trim() === CANCELLATION_HEADER)) return null

  const bookingIdLine = lines.find((l) => l.trim().startsWith('Code de réservation:'))
  const bookingId = bookingIdLine ? valueAfterColon(bookingIdLine.trim()) : undefined
  if (!bookingId) return null

  let serviceTitle: string | undefined
  const planningIdx = lines.findIndex((l) => l.trim() === 'Planning détaillé:')
  if (planningIdx !== -1) {
    for (let i = planningIdx + 1; i < lines.length; i++) {
      const v = lines[i]!.trim()
      if (v) { serviceTitle = v; break }
    }
  }

  const nomLine = lines.find((l) => l.trim().startsWith('Nom:'))
  const emailLine = lines.find((l) => l.trim().startsWith('E-mail:'))

  return {
    bookingId,
    serviceTitle,
    memberName: nomLine ? valueAfterColon(nomLine.trim()) : undefined,
    memberEmail: emailLine ? valueAfterColon(emailLine.trim()) : undefined,
  }
}
