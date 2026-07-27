import {
  FieldValue, type Transaction, type Firestore, type DocumentReference, type DocumentData, type DocumentSnapshot,
} from 'firebase-admin/firestore'

type FixedSlot = { dayOfWeek: number; startTime: string; serviceId: string }

type ClientSubscriptionData = DocumentData & {
  clientId: string
  planId: string
  planSnapshot: {
    name: string
    serviceIds: string[]
    sessionsPerWeek: number
    fixedSlot?: FixedSlot
    durationValue: number
    durationUnit: 'weeks' | 'months'
    price: number
  }
  startAt: FirebaseFirestore.Timestamp
  endAt: FirebaseFirestore.Timestamp
  status: 'pending_payment' | 'active' | 'cancelled'
  stripeSessionId?: string
}

// Semaine lundi-dimanche, calculée en heure serveur — imprécis de quelques heures autour de la
// frontière dimanche/lundi minuit si le serveur ne tourne pas en Europe/Zurich (contrairement au
// matching de créneau fixe, qui compare des champs dénormalisés côté client précisément pour
// éviter ce problème), mais sans impact réel pour un studio dont les cours ne commencent jamais
// entre 00h00 et 02h00 un lundi.
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

/**
 * À appeler pendant la phase de LECTURE de la transaction : lit l'abonnement actif du client via
 * Client.activeSubscriptionId, revalidé (status + date d'expiration) plutôt que fait confiance
 * aveuglément — ce champ peut être périmé si l'abonnement a expiré naturellement depuis.
 */
export async function findActiveSubscriptionInTransaction(
  tx: Transaction, adminDb: Firestore, clientId: string
): Promise<{ ref: DocumentReference; data: ClientSubscriptionData } | null> {
  const clientRef = adminDb.collection('clients').doc(clientId)
  const clientSnap = await tx.get(clientRef)
  if (!clientSnap.exists) return null
  const activeId = clientSnap.data()?.['activeSubscriptionId'] as string | undefined
  if (!activeId) return null

  const subRef = adminDb.collection('clientSubscriptions').doc(activeId)
  const subSnap = await tx.get(subRef)
  if (!subSnap.exists) return null
  const data = subSnap.data() as ClientSubscriptionData
  if (data.status !== 'active') return null
  if (data.endAt.toDate() < new Date()) return null

  return { ref: subRef, data }
}

export function matchesCoverage(
  plan: ClientSubscriptionData['planSnapshot'],
  groupSession: { serviceId?: string; dayOfWeek?: number; startTime?: string }
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

/** À appeler pendant la phase de LECTURE de la transaction (requête, pas juste un get de doc —
 * cf. resolveDiscountInTransaction qui fait déjà ça ailleurs dans ce code, précédent direct). */
export async function countWeeklyConsumptionsInTransaction(
  tx: Transaction, subscriptionRef: DocumentReference, sessionStartAt: Date
): Promise<number> {
  const weekStart = startOfWeekMonday(sessionStartAt)
  const weekEnd = endOfWeekMonday(sessionStartAt)
  const q = subscriptionRef.collection('consumptions')
    .where('sessionStartAt', '>=', weekStart)
    .where('sessionStartAt', '<=', weekEnd)
  const snap = await tx.get(q)
  return snap.size
}

/**
 * À appeler pendant la phase d'ÉCRITURE de la transaction. `uid` (compte Firebase Auth, pas
 * clientId) est dénormalisé pour que la requête de lecture côté client puisse filtrer directement
 * dessus (where('uid','==',...)) — une règle qui a besoin d'un get() pour vérifier l'accès ne
 * permet pas à Firestore de prouver qu'une requête `list` est sûre sans ce filtre explicite,
 * même quand le résultat est vide (sinon : "Missing or insufficient permissions").
 */
export function recordConsumptionInTransaction(
  tx: Transaction, subscriptionRef: DocumentReference,
  opts: { clientId: string; uid: string; groupSessionId: string; sessionStartAt: Date }
): void {
  const consumptionRef = subscriptionRef.collection('consumptions').doc()
  tx.set(consumptionRef, {
    clientId: opts.clientId,
    uid: opts.uid,
    groupSessionId: opts.groupSessionId,
    sessionStartAt: opts.sessionStartAt,
    consumedAt: FieldValue.serverTimestamp(),
  })
}

/**
 * Libère le quota d'une réservation annulée. Requête à faire pendant la phase de LECTURE
 * (retourne les refs à supprimer), suppression effective à faire ensuite pendant l'ÉCRITURE —
 * pas de consumptionId dénormalisé sur l'enrollment, on retrouve le(s) doc(s) par groupSessionId.
 */
export async function findConsumptionRefsInTransaction(
  tx: Transaction, subscriptionRef: DocumentReference, groupSessionId: string
): Promise<DocumentReference[]> {
  const snap = await tx.get(subscriptionRef.collection('consumptions').where('groupSessionId', '==', groupSessionId))
  return snap.docs.map(d => d.ref)
}

export function removeConsumptionsInTransaction(tx: Transaction, refs: DocumentReference[]): void {
  refs.forEach(ref => tx.delete(ref))
}

/**
 * Appelée depuis le webhook Stripe (achat en self-service). Applique l'invariant "un seul
 * abonnement actif" comme activateClientSubscriptionManually (SDK client, attribution manuelle),
 * mais en runtime Admin SDK — les deux DOIVENT revalider "pas d'autre abonnement actif" au moment
 * de l'activation, jamais faire confiance à un état lu plus tôt. Idempotente : le webhook Stripe
 * peut re-livrer le même événement (retry réseau, etc.).
 */
export async function activateSubscriptionFromWebhookInTransaction(
  tx: Transaction, adminDb: Firestore,
  opts: { clientSubscriptionId: string; clientId: string; stripeSessionId: string; amountPaid: number }
): Promise<'activated' | 'already_active' | 'not_found'> {
  const subRef = adminDb.collection('clientSubscriptions').doc(opts.clientSubscriptionId)
  const clientRef = adminDb.collection('clients').doc(opts.clientId)

  const [subSnap, clientSnap] = await Promise.all([tx.get(subRef), tx.get(clientRef)])
  if (!subSnap.exists || !clientSnap.exists) return 'not_found'

  const data = subSnap.data() as ClientSubscriptionData
  if (data.status === 'active' && data.stripeSessionId === opts.stripeSessionId) return 'already_active'

  const currentActiveId = clientSnap.data()?.['activeSubscriptionId'] as string | undefined
  let currentActiveRef: DocumentReference | null = null
  let currentActiveSnap: DocumentSnapshot | null = null
  if (currentActiveId && currentActiveId !== opts.clientSubscriptionId) {
    currentActiveRef = adminDb.collection('clientSubscriptions').doc(currentActiveId)
    currentActiveSnap = await tx.get(currentActiveRef)
  }

  if (currentActiveRef && currentActiveSnap?.exists && currentActiveSnap.data()?.['status'] === 'active') {
    tx.update(currentActiveRef, { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() })
  }

  tx.update(subRef, {
    status: 'active',
    paymentStatus: 'paid',
    amountPaid: opts.amountPaid,
    stripeSessionId: opts.stripeSessionId,
    updatedAt: FieldValue.serverTimestamp(),
  })
  tx.update(clientRef, { activeSubscriptionId: opts.clientSubscriptionId, updatedAt: FieldValue.serverTimestamp() })

  return 'activated'
}
