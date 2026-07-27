import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { findConsumptionRefsInTransaction, removeConsumptionsInTransaction } from '@/lib/server/subscription-admin'

type ServerEnrollment = Record<string, unknown> & { clientId: string; status: string; paymentStatus: string; amountPaid: number; subscriptionId?: string }

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { groupSessionId, clientId } = (await req.json()) as { groupSessionId?: string; clientId?: string }
  if (!groupSessionId || !clientId) return NextResponse.json({ error: 'groupSessionId et clientId requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()

    const callerSnap = await adminDb.collection('users').doc(uid).get()
    const roles = (callerSnap.data() as { roles?: string[] } | undefined)?.roles ?? []
    if (!roles.includes('coach') && !roles.includes('admin')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const groupSessionRef = adminDb.collection('groupSessions').doc(groupSessionId)

    const cancelledEntry = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(groupSessionRef)
      if (!snap.exists) throw new HttpError(404, 'Séance introuvable')

      const data = snap.data()!
      const enrollments = (data['enrollments'] as ServerEnrollment[] | undefined) ?? []
      const idx = enrollments.findIndex((e) => e.clientId === clientId && e.status !== 'cancelled')
      if (idx === -1) throw new HttpError(404, 'Aucune inscription active pour ce client')

      const entry = enrollments[idx]!

      const consumptionRefs = entry.subscriptionId
        ? await findConsumptionRefsInTransaction(
            tx, adminDb.collection('clientSubscriptions').doc(entry.subscriptionId), groupSessionId
          )
        : []

      const updated = [...enrollments]
      updated[idx] = { ...entry, status: 'cancelled', cancelledAt: Timestamp.now() }

      tx.update(groupSessionRef, { enrollments: updated, updatedAt: FieldValue.serverTimestamp() })
      removeConsumptionsInTransaction(tx, consumptionRefs)

      return entry
    })

    if (cancelledEntry.paymentStatus === 'paid') {
      await adminDb.collection('activityLogs').add({
        userId: uid,
        userFirstName: '',
        userLastName: '',
        action: 'group_session_cancelled_after_payment',
        description: `Inscription annulée manuellement par le coach après paiement (${cancelledEntry.amountPaid} CHF) — client ${clientId}, séance ${groupSessionId}`,
        clientId,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[group-sessions/admin-cancel-enrollment]', err)
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
