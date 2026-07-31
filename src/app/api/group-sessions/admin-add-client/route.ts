import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { notifyGroupSessionBooking } from '@/lib/server/booking-notifications'

type ServerEnrollment = Record<string, unknown> & { clientId?: string; status: string }

const ALLOWED_PAYMENT_STATUSES = ['paid', 'offered', 'payment_to_request'] as const
type AllowedPaymentStatus = typeof ALLOWED_PAYMENT_STATUSES[number]

function paymentLabelFor(paymentStatus: string): string {
  switch (paymentStatus) {
    case 'paid': return 'Payé'
    case 'offered': return 'Offert'
    case 'payment_to_request': return 'Paiement en attente'
    default: return paymentStatus
  }
}

// Ajoute un client EXISTANT (fiche `clients` déjà présente) à une séance collective — réservé
// coach/admin. Contrairement à admin-add-guest, le client reçoit le mail de confirmation habituel
// (mêmes infos qu'une réservation en self-service : séance, date, montant, accès), envoyé
// immédiatement puisqu'il n'y a pas de paiement Stripe à attendre ici.
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
    clientId?: string
    paymentStatus?: string
    amountPaid?: number
  }
  const { groupSessionId, clientId } = body
  const paymentStatus = body.paymentStatus as AllowedPaymentStatus | undefined

  if (!groupSessionId || !clientId) {
    return NextResponse.json({ error: 'groupSessionId et clientId requis' }, { status: 400 })
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

    const clientSnap = await adminDb.collection('clients').doc(clientId).get()
    if (!clientSnap.exists) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const groupSessionRef = adminDb.collection('groupSessions').doc(groupSessionId)

    const { newEnrollment, isNewToBooking } = await adminDb.runTransaction(async (tx) => {
      // Toutes les lectures d'abord — Firestore interdit une lecture après une écriture dans une transaction.
      const [snap, clientTxSnap] = await Promise.all([tx.get(groupSessionRef), tx.get(clientSnap.ref)])
      if (!snap.exists) throw new HttpError(404, 'Séance introuvable')

      const data = snap.data()!
      if (data['status'] !== 'planned') throw new HttpError(412, 'Séance non disponible')

      const enrollments = (data['enrollments'] as ServerEnrollment[] | undefined) ?? []
      if (enrollments.some((e) => e.clientId === clientId && e.status !== 'cancelled')) {
        throw new HttpError(409, 'Ce client est déjà inscrit à cette séance')
      }
      const activeCount = enrollments.filter((e) => e.status !== 'cancelled').length
      if (activeCount >= (data['maxParticipants'] as number)) {
        throw new HttpError(409, 'Séance complète')
      }

      const basePrice = data['price'] as number
      const amountPaid = paymentStatus === 'paid' ? (body.amountPaid ?? basePrice) : 0
      const amountDue = paymentStatus === 'offered' ? 0 : basePrice

      const entry: ServerEnrollment = {
        id: randomUUID(),
        clientId,
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

      const isNew = clientTxSnap.data()?.['hasEverBooked'] !== true
      if (isNew) {
        tx.update(clientSnap.ref, { hasEverBooked: true, updatedAt: FieldValue.serverTimestamp() })
      }

      return { newEnrollment: entry, isNewToBooking: isNew }
    })

    await adminDb.collection('activityLogs').add({
      userId: uid,
      userFirstName: '',
      userLastName: '',
      action: 'group_session_client_added_by_coach',
      description: `Client ajouté manuellement à la séance ${groupSessionId} (${paymentStatus})`,
      clientId,
      createdAt: FieldValue.serverTimestamp(),
    })

    await notifyGroupSessionBooking(adminDb, {
      groupSessionId,
      clientId,
      notifyCoaches: false,
      notifyClient: true,
      amountPaid: newEnrollment['amountPaid'] as number,
      paymentLabel: paymentLabelFor(paymentStatus),
      baseUrl: req.nextUrl.origin,
    })

    return NextResponse.json({ enrollment: newEnrollment, isNewToBooking })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[group-sessions/admin-add-client]', err)
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
