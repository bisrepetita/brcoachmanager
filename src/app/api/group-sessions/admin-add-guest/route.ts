import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'

type ServerEnrollment = Record<string, unknown> & { status: string }

const ALLOWED_PAYMENT_STATUSES = ['paid', 'offered', 'payment_to_request'] as const
type AllowedPaymentStatus = typeof ALLOWED_PAYMENT_STATUSES[number]

// Ajoute un participant "invité" à une séance collective — pas de fiche `clients` créée, contrairement
// à une inscription normale. Réservé au coach/admin (ex: personne de passage, essai ponctuel) : le
// coach saisit juste un nom, sans créer de compte ni de fiche client pour cette personne.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const body = (await req.json()) as {
    groupSessionId?: string
    guestName?: string
    paymentStatus?: string
    amountPaid?: number
  }
  const { groupSessionId } = body
  const guestName = body.guestName?.trim()
  const paymentStatus = body.paymentStatus as AllowedPaymentStatus | undefined

  if (!groupSessionId || !guestName) {
    return NextResponse.json({ error: 'groupSessionId et guestName requis' }, { status: 400 })
  }
  if (!paymentStatus || !ALLOWED_PAYMENT_STATUSES.includes(paymentStatus)) {
    return NextResponse.json({ error: 'paymentStatus invalide' }, { status: 400 })
  }

  try {
    const adminDb = getAdminDb()

    const callerSnap = await adminDb.collection('users').doc(uid).get()
    const roles = (callerSnap.data() as { roles?: string[] } | undefined)?.roles ?? []
    if (!roles.includes('coach') && !roles.includes('admin')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const groupSessionRef = adminDb.collection('groupSessions').doc(groupSessionId)

    const newEnrollment = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(groupSessionRef)
      if (!snap.exists) throw new HttpError(404, 'Séance introuvable')

      const data = snap.data()!
      if (data['status'] !== 'planned') throw new HttpError(412, 'Séance non disponible')

      const enrollments = (data['enrollments'] as ServerEnrollment[] | undefined) ?? []
      const activeCount = enrollments.filter((e) => e.status !== 'cancelled').length
      if (activeCount >= (data['maxParticipants'] as number)) {
        throw new HttpError(409, 'Séance complète')
      }

      const basePrice = data['price'] as number
      const amountPaid = paymentStatus === 'paid' ? (body.amountPaid ?? basePrice) : 0
      const amountDue = paymentStatus === 'offered' ? 0 : basePrice

      const entry = {
        id: randomUUID(),
        guestName,
        status: 'confirmed',
        amountDue,
        amountPaid,
        paymentStatus,
        enrolledAt: Timestamp.now(),
        ...(paymentStatus === 'paid' ? { paidAt: Timestamp.now() } : {}),
      }

      tx.update(groupSessionRef, {
        enrollments: [...enrollments, entry],
        updatedAt: FieldValue.serverTimestamp(),
      })

      return entry
    })

    await adminDb.collection('activityLogs').add({
      userId: uid,
      userFirstName: '',
      userLastName: '',
      action: 'group_session_guest_added',
      description: `Invité "${guestName}" ajouté manuellement à la séance ${groupSessionId} (${paymentStatus})`,
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ enrollment: newEnrollment })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[group-sessions/admin-add-guest]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
