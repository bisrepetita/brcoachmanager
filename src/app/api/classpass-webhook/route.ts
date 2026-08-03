import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import { parseClassPassEmail, parseClassPassCancellation } from '@/lib/server/classpass-parser'
import { importClassPassBooking, cancelClassPassBooking } from '@/lib/server/classpass-import'

// Reçoit les mails "Nouvelle réservation" ClassPass, transférés par une route Mailgun (inbound
// parsing) — pas directement par Infomaniak, qui ne sait que rediriger vers une autre boîte mail,
// pas appeler une URL. Signature vérifiée pour éviter qu'un tiers forge de faux clients/inscriptions.
function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const key = process.env.MAILGUN_SIGNING_KEY
  if (!key) return false
  const expected = crypto.createHmac('sha256', key).update(timestamp + token).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const timestamp = formData.get('timestamp') as string | null
  const token = formData.get('token') as string | null
  const signature = formData.get('signature') as string | null

  if (!timestamp || !token || !signature || !verifyMailgunSignature(timestamp, token, signature)) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  }

  // `body-plain` (corps brut complet) plutôt que `stripped-text` : le filtrage "anti-signature"
  // de Mailgun peut tronquer à tort le contenu utile (ex: une ligne "Prénom Nom" isolée juste
  // avant l'email du membre ressemble à une signature) — vu en test, ça coupait juste avant les
  // infos du membre. Notre parseur cible des labels précis, le contenu superflu (liens, mentions
  // légales) en fin de mail n'interfère pas, donc autant garder tout le corps.
  const rawText = (formData.get('body-plain') as string | null) || (formData.get('stripped-text') as string | null) || ''
  const adminDb = getAdminDb()

  const newBooking = parseClassPassEmail(rawText)
  if (newBooking) {
    const result = await importClassPassBooking(adminDb, newBooking, req.nextUrl.origin)
    return NextResponse.json(result)
  }

  const cancellation = parseClassPassCancellation(rawText)
  if (cancellation) {
    const result = await cancelClassPassBooking(adminDb, cancellation)
    return NextResponse.json(result)
  }

  // Toujours 200 — Mailgun réessaie sinon indéfiniment un mail qui ne sera jamais parsable (autre
  // type de notification ClassPass : rappel, demande d'avis, etc.), pas seulement celui-ci.
  await adminDb.collection('activityLogs').add({
    userId: 'classpass-import',
    userFirstName: 'ClassPass',
    userLastName: '',
    action: 'group_session_classpass_error',
    description: 'Mail ClassPass reçu mais non parsable (format inconnu — ni nouvelle réservation, ni annulation)',
    // Aperçu du texte brut reçu, pour diagnostiquer sans dépendre du stockage Mailgun (désactivé
    // par défaut, "Message retrieval disabled for domain").
    rawTextPreview: rawText.slice(0, 1500),
    createdAt: FieldValue.serverTimestamp(),
  })
  return NextResponse.json({ ok: false, reason: 'parse_failed' })
}
