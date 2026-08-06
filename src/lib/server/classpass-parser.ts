export interface ParsedClassPassBooking {
  bookingId: string
  serviceTitle: string
  sessionDateTime: Date
  memberName: string
  memberFirstName: string
  memberLastName: string
  memberEmail: string
}

// Mailgun (body-plain, converti depuis le HTML d'origine) retourne les mails ClassPass avec des
// retours à la ligne très étroits, y compris AU MILIEU des libellés eux-mêmes (ex: "Code de\n
// réservation:" sur deux lignes) — observé sur un vrai mail. Un parsing ligne-par-ligne exact est
// donc trop fragile. On aplatit tout le texte en une seule ligne (espaces normalisés) et on
// extrait par regex, insensible à l'endroit exact où l'email a coupé les lignes.
function flatten(rawText: string): string {
  return rawText.replace(/\r?\n/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/
const MEMBER_BLOCK_STOP = /\s+(Détails du planning|Réservations ClassPass)\b/

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

// À partir du bloc "Informations du membre <G> Prénom Nom email@x.com Nouveau(elle) client(e)"
// (aplati), isole le nom (en écartant l'initiale d'avatar rendue en texte seul et les mentions
// "Nouveau(elle)/Client(e) existant(e)") et l'email.
function extractMember(block: string): { name: string; email: string } | null {
  const emailMatch = block.match(EMAIL_RE)
  if (!emailMatch) return null
  const email = emailMatch[0]
  const nameTokens = block
    .slice(0, emailMatch.index)
    .replace(/Nouveau\(elle\) client\(e\)/gi, '')
    .replace(/Client\(e\) existant\(e\)/gi, '')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1) // écarte une initiale seule (ex: "G")
  if (nameTokens.length === 0) return null
  return { name: nameTokens.join(' '), email }
}

// Parse le texte brut du mail "Nouvelle réservation" ClassPass. Retourne null si un champ
// essentiel manque (mail dans un format différent — annulation, rappel, etc.) plutôt que de
// deviner des valeurs partielles.
export function parseClassPassEmail(rawText: string): ParsedClassPassBooking | null {
  const flat = flatten(rawText)

  // Une annulation, un rappel ou une demande d'avis peut réutiliser exactement la même mise en
  // page "Détails de la réservation" (cours/date/ID/membre) — sans ce marqueur d'en-tête, on
  // refuse de parser plutôt que de risquer de traiter une annulation comme une nouvelle inscription.
  if (!flat.includes('Nouvelle réservation')) return null

  // "Réservation" en tant que libellé autonome (capitale), pas la sous-chaîne dans "Détails de la
  // réservation" (minuscule) ni "Réservations ClassPass" (pluriel, section statistiques plus loin).
  const titleMatch = flat.match(/(?<!la )\bRéservation\b\s+(.+?)\s+Date et heure\b/)
  const dateMatch = flat.match(/Date et heure\s+([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}\s*@\s*\d{1,2}:\d{2}\s*[AP]M)/i)
  const bookingIdMatch = flat.match(/ID de réservation\s+([a-f0-9]{16,40})/i)

  const memberIdx = flat.indexOf('Informations du membre')
  let member: { name: string; email: string } | null = null
  if (memberIdx !== -1) {
    const stopMatch = flat.slice(memberIdx).match(MEMBER_BLOCK_STOP)
    const blockEnd = stopMatch?.index !== undefined ? memberIdx + stopMatch.index : flat.length
    const block = flat.slice(memberIdx + 'Informations du membre'.length, blockEnd)
    member = extractMember(block)
  }

  const serviceTitle = titleMatch?.[1]?.trim()
  const bookingIdRaw = bookingIdMatch?.[1]
  if (!serviceTitle || !dateMatch || !bookingIdRaw || !member) return null

  const sessionDateTime = parseClassPassDateTime(dateMatch[1]!)
  if (!sessionDateTime) return null

  const nameParts = member.name.split(/\s+/)
  const memberFirstName = nameParts[0]!
  const memberLastName = nameParts.slice(1).join(' ')

  return {
    bookingId: bookingIdRaw.trim(),
    serviceTitle,
    sessionDateTime,
    memberName: member.name,
    memberFirstName,
    memberLastName,
    memberEmail: member.email,
  }
}

export interface ParsedClassPassCancellation {
  bookingId: string
  serviceTitle?: string
  memberName?: string
  memberEmail?: string
}

const CANCELLATION_HEADER = "La réservation ClassPass suivante a été annulée par l'utilisateur"

// Format ClassPass observé pour une annulation — mise en page différente du mail de nouvelle
// réservation ("Champ: valeur", pas "Champ" puis valeur en dessous).
export function parseClassPassCancellation(rawText: string): ParsedClassPassCancellation | null {
  const flat = flatten(rawText)
  if (!flat.includes(CANCELLATION_HEADER)) return null

  const bookingIdMatch = flat.match(/Code de réservation:\s*([a-f0-9]{16,40})/i)
  if (!bookingIdMatch) return null

  // S'arrête avant la parenthèse ouvrante du lien de tracking ClassPass qui suit toujours le nom
  // du cours dans ce gabarit ("Round by Round ( https://... )").
  const serviceMatch = flat.match(/Planning détaillé:\s*(.+?)\s*\(/)
  const nameMatch = flat.match(/\bNom:\s*(.+?)\s*E-mail:/i)
  const emailMatch = flat.match(/E-mail:\s*(\S+@\S+?)(?:\s|$)/i)

  return {
    bookingId: bookingIdMatch[1]!.trim(),
    serviceTitle: serviceMatch?.[1]?.trim(),
    memberName: nameMatch?.[1]?.trim(),
    memberEmail: emailMatch?.[1]?.trim(),
  }
}
