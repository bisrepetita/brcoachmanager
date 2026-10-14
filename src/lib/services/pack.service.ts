import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, serverTimestamp, Timestamp, where } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/config'
import { db } from '@/lib/firebase/firestore'
import type { ClientPack, PackPlan, PaymentStatus } from '@/types'

/** Pack utilisable : payé/attribué (actif), pas expiré, avec au moins un crédit restant. */
export function isPackUsable(pack: ClientPack, now = new Date()): boolean {
  return pack.status === 'active' && pack.creditsRemaining > 0 && pack.expiresAt.toDate() > now
}

/** Valeur d'un crédit (prix du pack / nombre de séances) — base du CA reconnu à l'usage. */
export function packCreditValue(pack: Pick<ClientPack, 'packSnapshot'>): number {
  return Math.round((pack.packSnapshot.price / pack.packSnapshot.sessionCount) * 100) / 100
}

/**
 * Packs d'un client, actifs ou non (hors achats en attente de paiement). `uid` est requis côté
 * client : les règles Firestore n'autorisent la requête que filtrée sur le uid du compte connecté.
 */
export async function findClientPacks(clientId: string, uid?: string): Promise<ClientPack[]> {
  const constraints = [where('clientId', '==', clientId)]
  if (uid) constraints.push(where('uid', '==', uid))
  const snap = await getDocs(query(collection(db, 'clientPacks'), ...constraints))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as ClientPack))
    .filter(p => p.status !== 'pending_payment')
    .sort((a, b) => a.expiresAt.toMillis() - b.expiresAt.toMillis())
}

export async function purchasePackPlan(packPlanId: string): Promise<{ checkoutUrl: string }> {
  const token = await getAuth(firebaseApp).currentUser?.getIdToken()
  if (!token) throw new Error('Non authentifié')

  const res = await fetch('/api/packs/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ packPlanId }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `HTTP ${res.status}`
    try { message = (JSON.parse(text) as { error: string }).error ?? message } catch { message = text || message }
    throw new Error(message)
  }

  return (await res.json()) as { checkoutUrl: string }
}

function computePackExpiry(start: Date, value: number, unit: 'weeks' | 'months'): Date {
  const end = new Date(start)
  if (unit === 'weeks') end.setDate(end.getDate() + value * 7)
  else end.setMonth(end.getMonth() + value)
  return end
}

/** Attribution manuelle d'un pack par l'admin (payé en espèces/TWINT direct, offert, à encaisser). */
export async function assignPackManually(opts: {
  clientId: string
  plan: PackPlan
  paymentStatus: PaymentStatus
  createdBy: string
}): Promise<string> {
  const clientSnap = await getDoc(doc(db, 'clients', opts.clientId))
  if (!clientSnap.exists()) throw new Error('Client introuvable.')
  // uid du compte client s'il existe déjà (sinon renseigné à la création du compte, cf. client-signup)
  const clientUid = clientSnap.data()['uid'] as string | undefined
  const now = new Date()
  const ref = doc(collection(db, 'clientPacks'))
  await setDoc(ref, {
    clientId: opts.clientId,
    ...(clientUid ? { uid: clientUid } : {}),
    packPlanId: opts.plan.id,
    packSnapshot: {
      name: opts.plan.name,
      sessionCount: opts.plan.sessionCount,
      price: opts.plan.price,
      validityValue: opts.plan.validityValue,
      validityUnit: opts.plan.validityUnit,
      serviceIds: opts.plan.serviceIds,
    },
    creditsTotal: opts.plan.sessionCount,
    creditsRemaining: opts.plan.sessionCount,
    purchasedAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(computePackExpiry(now, opts.plan.validityValue, opts.plan.validityUnit)),
    status: 'active',
    paymentStatus: opts.paymentStatus,
    amountDue: opts.plan.price,
    amountPaid: opts.paymentStatus === 'paid' ? opts.plan.price : 0,
    source: 'manual',
    createdBy: opts.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function markPackPaid(pack: ClientPack): Promise<void> {
  await updateDoc(doc(db, 'clientPacks', pack.id), { paymentStatus: 'paid', amountPaid: pack.amountDue, updatedAt: serverTimestamp() })
}

/** Annule un pack : ses crédits restants ne sont plus utilisables (les inscriptions déjà faites restent). */
export async function cancelClientPack(packId: string): Promise<void> {
  await updateDoc(doc(db, 'clientPacks', packId), { status: 'cancelled', updatedAt: serverTimestamp() })
}

/** Libellé d'état d'un pack pour l'affichage (expiré/épuisé ne sont pas stockés, cf. ClientPackStatus). */
export function packStateLabel(pack: ClientPack, now = new Date()): { label: string; color: string } {
  if (pack.status === 'cancelled') return { label: 'Annulé', color: '#A09890' }
  if (pack.status === 'pending_payment') return { label: 'Paiement en attente', color: '#F59E0B' }
  if (pack.expiresAt.toDate() <= now) return { label: 'Expiré', color: '#A09890' }
  if (pack.creditsRemaining <= 0) return { label: 'Épuisé', color: '#7A7570' }
  return { label: 'Actif', color: '#2D7A4F' }
}
