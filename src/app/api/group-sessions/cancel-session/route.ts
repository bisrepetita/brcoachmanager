import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { findConsumptionRefsInTransaction, removeConsumptionsInTransaction } from '@/lib/server/subscription-admin'
import { preparePackCreditRefundInTransaction } from '@/lib/server/pack-admin'
import { restoreReferralFreeSessionInTransaction } from '@/lib/server/referral-admin'

type ServerEnrollment = Record<string, unknown> & { status: string; subscriptionId?: string }

// Annulation d'une séance collective entière par son coach (ou un admin). Rend aux inscrits ce
// qu'ils ont "dépensé" sans contrepartie : le crédit de pack et le quota hebdomadaire
// d'abonnement. Les paiements en argent (Stripe, TWINT…) restent à rembourser à la main, comme
// avant. Les inscriptions gardent leur statut (historique), seule la séance passe 'cancelled'.
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
    const callerRoles = ((await adminDb.collection('users').doc(uid).get()).data()?.['roles'] as string[] | undefined) ?? []
    const groupSessionRef = adminDb.collection('groupSessions').doc(groupSessionId)

    const refunded = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(groupSessionRef)
      if (!snap.exists) throw new HttpError(404, 'Séance introuvable')
      const data = snap.data()!
      const isAssignedCoach = ((data['coachIds'] as string[] | undefined) ?? []).includes(uid)
      if (!callerRoles.includes('admin') && !(callerRoles.includes('coach') && isAssignedCoach)) {
        throw new HttpError(403, 'Non autorisé')
      }
      if (data['status'] === 'cancelled') return 0

      // Phase lecture (toutes les lectures avant toute écriture)
      const enrollments = (data['enrollments'] as ServerEnrollment[] | undefined) ?? []
      const consumptionRefs: DocumentReference[] = []
      const packRefunds: Array<{ idx: number; apply: () => void }> = []
      for (const [idx, entry] of enrollments.entries()) {
        if (entry.status === 'cancelled') continue
        if (entry.subscriptionId) {
          consumptionRefs.push(...await findConsumptionRefsInTransaction(
            tx, adminDb.collection('clientSubscriptions').doc(entry.subscriptionId), groupSessionId))
        }
        const apply = await preparePackCreditRefundInTransaction(tx, adminDb, entry)
        if (apply) packRefunds.push({ idx, apply })
      }

      // Phase écriture
      const updated = enrollments.map((e, idx) =>
        packRefunds.some((r) => r.idx === idx) ? { ...e, packCreditRefunded: true } : e)
      tx.update(groupSessionRef, {
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
        enrollments: updated,
        updatedAt: FieldValue.serverTimestamp(),
      })
      removeConsumptionsInTransaction(tx, consumptionRefs)
      packRefunds.forEach((r) => r.apply())
      for (const e of enrollments) if (e.status !== 'cancelled') restoreReferralFreeSessionInTransaction(tx, adminDb, e)
      return packRefunds.length
    })

    return NextResponse.json({ ok: true, packCreditsRefunded: refunded })
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[group-sessions/cancel-session]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
