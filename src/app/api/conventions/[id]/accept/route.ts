import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import { sendEmail } from '@/lib/server/email'
import { conventionAcceptedParticipantEmail, conventionAcceptedAdminEmail } from '@/lib/server/email-templates'
import { generateConventionPdf } from '@/lib/server/convention-pdf'
import type { Convention } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Route publique (pas d'auth requise) : une personne qui remplit le formulaire de convention
// n'a pas forcément de compte. Elle est retrouvée ou créée comme fiche client, son acceptation est
// enregistrée comme trace, et une copie PDF lui est envoyée par e-mail.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await req.json()) as {
      firstName?: string; lastName?: string; email?: string; phone?: string; agree?: boolean
    }

    const firstName = body.firstName?.trim()
    const lastName = body.lastName?.trim()
    const email = body.email?.trim().toLowerCase()
    const phone = body.phone?.trim()

    if (!firstName || !lastName || !email || !phone) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Adresse e-mail invalide' }, { status: 400 })
    }
    if (body.agree !== true) {
      return NextResponse.json({ error: 'L\'acceptation des conditions est requise' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    const conventionRef = adminDb.collection('conventions').doc(id)

    const conventionSnap = await conventionRef.get()
    if (!conventionSnap.exists) throw new HttpError(404, 'Convention introuvable')
    const convention = { id: conventionSnap.id, ...conventionSnap.data() } as Convention
    if (convention.status !== 'active') throw new HttpError(412, 'Convention non disponible')

    // Retrouve une fiche client existante par e-mail, sinon en crée une — même logique que
    // /api/client-signup, mais sans uid puisque la personne n'a pas de compte connecté.
    const existingMatches = await adminDb.collection('clients').where('email', '==', email).limit(1).get()
    let clientId: string
    if (!existingMatches.empty) {
      clientId = existingMatches.docs[0]!.id
      const existingPhone = existingMatches.docs[0]!.data()['phone']
      if (!existingPhone) {
        await existingMatches.docs[0]!.ref.update({ phone, updatedAt: FieldValue.serverTimestamp() })
      }
    } else {
      const newClientRef = adminDb.collection('clients').doc()
      clientId = newClientRef.id
      await newClientRef.set({
        firstName, lastName, email, phone,
        sessionCredits: 0,
        visibleToCoachIds: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    const acceptanceRef = conventionRef.collection('acceptances').doc()
    const acceptedAt = Timestamp.now()
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined
    const userAgent = req.headers.get('user-agent') ?? undefined

    const acceptedAtLabel = acceptedAt.toDate().toLocaleString('fr-CH', {
      dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Zurich',
    })

    // Le PDF est généré avant l'écriture Firestore : s'il échoue, on préfère renvoyer une erreur
    // plutôt que d'enregistrer une acceptation sans jamais pouvoir envoyer la copie au participant.
    const pdfBuffer = await generateConventionPdf(
      {
        title: convention.title,
        activityLabel: convention.activityLabel,
        dayTimeLabel: convention.dayTimeLabel,
        pricePerSession: convention.pricePerSession,
        groupSize: convention.groupSize,
        maxParticipants: convention.maxParticipants,
        version: convention.version,
        versionDate: convention.versionDate,
      },
      { firstName, lastName, email, phone, acceptedAtLabel, ip }
    )

    const emailSent = await sendEmail({
      to: email,
      ...conventionAcceptedParticipantEmail({ firstName, conventionTitle: convention.title }),
      attachments: [{ filename: `convention-${convention.id}.pdf`, content: pdfBuffer }],
    })

    await acceptanceRef.set({
      conventionId: convention.id,
      firstName, lastName, email, phone,
      version: convention.version,
      versionDate: convention.versionDate,
      clientId,
      acceptedAt,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      emailSent,
    })

    await conventionRef.update({
      acceptanceCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    })

    await adminDb.collection('activityLogs').add({
      userId: 'public',
      userFirstName: firstName,
      userLastName: lastName,
      action: 'convention_accepted',
      description: `Convention "${convention.title}" acceptée par ${firstName} ${lastName} (${email})`,
      clientId,
      createdAt: FieldValue.serverTimestamp(),
    })

    // Notification admin best-effort — jamais bloquante pour la réponse au participant.
    try {
      const adminsSnap = await adminDb.collection('users').where('roles', 'array-contains', 'admin').get()
      const baseUrl = req.nextUrl.origin
      await Promise.all(adminsSnap.docs.map(async (adminSnap) => {
        const adminEmail = adminSnap.data()['email'] as string | undefined
        if (!adminEmail) return
        await sendEmail({
          to: adminEmail,
          ...conventionAcceptedAdminEmail({
            adminFirstName: (adminSnap.data()['firstName'] as string) ?? '',
            conventionTitle: convention.title,
            participantName: `${firstName} ${lastName}`,
            participantEmail: email,
            participantPhone: phone,
            conventionUrl: `${baseUrl}/admin/conventions/${convention.id}`,
          }),
        })
      }))
    } catch (err) {
      console.error('[conventions/accept] notification admin non bloquante:', err)
    }

    return NextResponse.json({ ok: true, clientId, acceptanceId: acceptanceRef.id, emailSent })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[conventions/accept]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
