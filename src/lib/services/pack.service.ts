import { collection, getDocs, query, where } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/config'
import { db } from '@/lib/firebase/firestore'
import type { ClientPack } from '@/types'

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
