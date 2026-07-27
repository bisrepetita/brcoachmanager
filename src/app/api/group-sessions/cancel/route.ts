import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { findConsumptionRefsInTransaction, removeConsumptionsInTransaction } from '@/lib/server/subscription-admin'

// Type "loose" côté serveur : le type partagé GroupSessionEnrollment (src/types) pointe sur le
// Timestamp du SDK client, incompatible avec firebase-admin/firestore côté API route.
type ServerEnrollment = Record<string, unknown> & { clientId: string; status: string; paymentStatus: string; amountPaid: number; subscriptionId?: string }

const DEFAULT_DEADLINE_HOURS = 24

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { groupSessionId } = (await req.json()) as { groupSessionId?: string }
  if (!groupSessionId) return NextResponse.json({ error: 'groupSessionId requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()

    const clientSnap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
    if (clientSnap.empty) {
      return NextResponse.json({ error: 'Compte non lié à une fiche client' }, { status: 412 })
    }
    const clientId = clientSnap.docs[0]!.id

    const settingsSnap = await adminDb.collection('settings').doc('global').get()
    const deadlineHours = (settingsSnap.data()?.['groupSessionCancellationDeadlineHours'] as number | undefined)
      ?? DEFAULT_DEADLINE_HOURS

    const groupSessionRef = adminDb.collection('groupSessions').doc(groupSessionId)

    const cancelledEntry = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(groupSessionRef)
      if (!snap.exists) throw new HttpError(404, 'Séance introuvable')

      const data = snap.data()!
      const enrollments = (data['enrollments'] as ServerEnrollment[] | undefined) ?? []
      const idx = enrollments.findIndex((e) => e.clientId === clientId && e.status !== 'cancelled')
      if (idx === -1) throw new HttpError(404, 'Aucune inscription active à annuler')

      const startAt = (data['startAt'] as Timestamp).toDate()
      const deadline = startAt.getTime() - deadlineHours * 60 * 60 * 1000
      if (Date.now() > deadline) {
        throw new HttpError(412, `Délai d'annulation dépassé (${deadlineHours}h avant le début), contacte ton coach.`)
      }

      const entry = enrollments[idx]!

      // Contrairement aux remises (qui restent "consommées" même après annulation), un quota
      // hebdomadaire d'abonnement est une ressource récurrente activement payée — on le libère.
      const consumptionRefs = entry.subscriptionId
        ? await findConsumptionRefsInTransaction(
            tx, adminDb.collection('clientSubscriptions').doc(entry.subscriptionId), groupSessionId
          )
        : []

      const updated = [...enrollments]
      updated[idx] = { ...entry, status: 'cancelled', cancelledAt: Timestamp.now() }

      tx.update(groupSessionRef, {
        enrollments: updated,
        updatedAt: FieldValue.serverTimestamp(),
      })
      removeConsumptionsInTransaction(tx, consumptionRefs)

      return entry
    })

    if (cancelledEntry.paymentStatus === 'paid') {
      await adminDb.collection('activityLogs').add({
        userId: uid,
        userFirstName: '',
        userLastName: '',
        action: 'group_session_cancelled_after_payment',
        description: `Annulation après paiement (${cancelledEntry.amountPaid} CHF) — client ${clientId}, séance ${groupSessionId}`,
        clientId,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[group-sessions/cancel]', err)
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
