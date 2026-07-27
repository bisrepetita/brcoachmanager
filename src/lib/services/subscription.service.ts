import {
  collection, doc, query, where, getDocs,
  runTransaction, serverTimestamp, Timestamp, deleteField,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/config'
import { db } from '@/lib/firebase/firestore'
import type {
  ClientSubscription, ClientSubscriptionPlanSnapshot, SubscriptionPlan, SubscriptionDurationUnit,
  PaymentStatus, GroupSession,
} from '@/types'

function computeEndDate(start: Date, value: number, unit: SubscriptionDurationUnit): Date {
  const end = new Date(start)
  if (unit === 'weeks') end.setDate(end.getDate() + value * 7)
  else end.setMonth(end.getMonth() + value)
  return end
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  const monday = new Date(d)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() + diff)
  return monday
}
function endOfWeekMonday(d: Date): Date {
  const end = startOfWeekMonday(d)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

export function matchesSubscriptionCoverage(
  plan: ClientSubscriptionPlanSnapshot,
  groupSession: Pick<GroupSession, 'serviceId' | 'dayOfWeek' | 'startTime'>
): boolean {
  if (!groupSession.serviceId || !plan.serviceIds.includes(groupSession.serviceId)) return false
  if (plan.fixedSlot) {
    return (
      groupSession.serviceId === plan.fixedSlot.serviceId &&
      groupSession.dayOfWeek === plan.fixedSlot.dayOfWeek &&
      groupSession.startTime === plan.fixedSlot.startTime
    )
  }
  return true
}

// `uid` requis (pas optionnel comme sur findActiveSubscriptionForClient) : seul appelant actuel
// est le contexte client (group-sessions/[id]/page.tsx) — cf. commentaire sur
// recordConsumptionInTransaction, même contrainte de filtre explicite pour une requête `list`.
export async function countWeeklySubscriptionConsumptions(subscriptionId: string, referenceDate: Date, uid: string): Promise<number> {
  const weekStart = startOfWeekMonday(referenceDate)
  const weekEnd = endOfWeekMonday(referenceDate)
  const snap = await getDocs(query(
    collection(db, 'clientSubscriptions', subscriptionId, 'consumptions'),
    where('uid', '==', uid),
    where('sessionStartAt', '>=', Timestamp.fromDate(weekStart)),
    where('sessionStartAt', '<=', Timestamp.fromDate(weekEnd)),
  ))
  return snap.size
}

// `uid` (compte Firebase Auth) optionnel : requis côté client pour que Firestore puisse prouver la
// requête `list` sûre sans get() (cf. commentaire sur consumptions/recordConsumptionInTransaction) ;
// omis côté coach (clients/[id]/page.tsx), qui passe par la règle isCoach() à la place.
export async function findActiveSubscriptionForClient(clientId: string, uid?: string): Promise<ClientSubscription | null> {
  const constraints = [where('clientId', '==', clientId), where('status', '==', 'active')]
  if (uid) constraints.push(where('uid', '==', uid))
  const snap = await getDocs(query(collection(db, 'clientSubscriptions'), ...constraints))
  const now = new Date()
  const candidates = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as ClientSubscription))
    .filter(s => s.endAt.toDate() >= now)
  return candidates[0] ?? null
}

// Invariant "un seul abonnement actif" : toute activation passe par cette transaction — elle
// annule l'abonnement actif précédent (s'il y en a un, revalidé au moment de l'écriture, pas
// seulement supposé depuis un état lu plus tôt) avant d'activer le nouveau.
export async function activateClientSubscriptionManually(opts: {
  clientId: string
  plan: SubscriptionPlan
  paymentStatus: PaymentStatus
  amountPaid: number
  createdBy: string
}): Promise<string> {
  const clientRef = doc(db, 'clients', opts.clientId)
  const newSubRef = doc(collection(db, 'clientSubscriptions'))
  const now = new Date()
  const endAt = computeEndDate(now, opts.plan.durationValue, opts.plan.durationUnit)

  await runTransaction(db, async (tx) => {
    const clientSnap = await tx.get(clientRef)
    if (!clientSnap.exists()) throw new Error('Client introuvable.')
    const clientUid = clientSnap.data()['uid'] as string | undefined

    const currentActiveId = clientSnap.data()['activeSubscriptionId'] as string | undefined
    let currentActiveRef = null
    let currentActiveSnap = null
    if (currentActiveId) {
      currentActiveRef = doc(db, 'clientSubscriptions', currentActiveId)
      currentActiveSnap = await tx.get(currentActiveRef)
    }

    if (currentActiveRef && currentActiveSnap?.exists() && currentActiveSnap.data()['status'] === 'active') {
      tx.update(currentActiveRef, { status: 'cancelled', updatedAt: serverTimestamp() })
    }

    tx.set(newSubRef, {
      clientId: opts.clientId,
      ...(clientUid ? { uid: clientUid } : {}),
      planId: opts.plan.id,
      planSnapshot: {
        name: opts.plan.name,
        serviceIds: opts.plan.serviceIds,
        sessionsPerWeek: opts.plan.sessionsPerWeek,
        ...(opts.plan.fixedSlot ? { fixedSlot: opts.plan.fixedSlot } : {}),
        durationValue: opts.plan.durationValue,
        durationUnit: opts.plan.durationUnit,
        price: opts.plan.price,
      },
      startAt: Timestamp.fromDate(now),
      endAt: Timestamp.fromDate(endAt),
      status: 'active',
      paymentStatus: opts.paymentStatus,
      amountDue: opts.plan.price,
      amountPaid: opts.amountPaid,
      source: 'manual',
      createdBy: opts.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    tx.update(clientRef, { activeSubscriptionId: newSubRef.id, updatedAt: serverTimestamp() })
  })

  return newSubRef.id
}

export async function purchaseSubscriptionPlan(planId: string): Promise<{ checkoutUrl: string }> {
  const auth = getAuth(firebaseApp)
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Non authentifié')

  const res = await fetch('/api/subscriptions/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ planId }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `HTTP ${res.status}`
    try { message = (JSON.parse(text) as { error: string }).error ?? message } catch { message = text || message }
    throw new Error(message)
  }

  return (await res.json()) as { checkoutUrl: string }
}

export async function cancelClientSubscription(subscriptionId: string, clientId: string): Promise<void> {
  const subRef = doc(db, 'clientSubscriptions', subscriptionId)
  const clientRef = doc(db, 'clients', clientId)
  await runTransaction(db, async (tx) => {
    const clientSnap = await tx.get(clientRef)
    tx.update(subRef, { status: 'cancelled', updatedAt: serverTimestamp() })
    if (clientSnap.exists() && clientSnap.data()['activeSubscriptionId'] === subscriptionId) {
      tx.update(clientRef, { activeSubscriptionId: deleteField(), updatedAt: serverTimestamp() })
    }
  })
}
