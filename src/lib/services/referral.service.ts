import { collection, deleteField, getDocs, query, serverTimestamp, where, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { updateDocById } from '@/lib/services/crud.service'
import type { Client, ClientPayment, GroupSession } from '@/types'

// Suivi des parrainages côté admin. Le parrain ne reçoit rien d'automatique : un parrainage devient
// "à récompenser" dès le premier achat payant du filleul (séance, vente, pack ou abonnement
// réellement encaissé), puis l'admin le marque "récompensé" après avoir récompensé le parrain.

export type ReferralStatus = 'signed_up' | 'free_session_used' | 'to_reward' | 'rewarded'

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  signed_up: 'Inscrit',
  free_session_used: 'Séance offerte utilisée',
  to_reward: 'À récompenser',
  rewarded: 'Récompensé',
}

export interface FirstPaidPurchase { date: Date; label: string }

export function referralStatus(filleul: Client, firstPaid: FirstPaidPurchase | null): ReferralStatus {
  if (filleul.referralRewardedAt) return 'rewarded'
  if (firstPaid) return 'to_reward'
  if (filleul.referralFreeSessionUsed) return 'free_session_used'
  return 'signed_up'
}

/** Fiches clients parrainées (admin uniquement — la requête n'est pas filtrée par coach). */
export async function findReferredClients(): Promise<Client[]> {
  const snap = await getDocs(query(collection(db, 'clients'), where('referredByClientId', '>', '')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Client))
}

const toDate = (t: Timestamp | undefined): Date | undefined => t?.toDate?.()

/** Premier achat réellement payé par le client, toutes sources confondues (null si aucun). */
export async function findFirstPaidPurchase(clientId: string): Promise<FirstPaidPurchase | null> {
  const [groupSessions, sessions, sales, packs, subscriptions] = await Promise.all([
    getDocs(query(collection(db, 'groupSessions'), where('enrolledClientIds', 'array-contains', clientId))),
    getDocs(query(collection(db, 'sessions'), where('clientIds', 'array-contains', clientId))),
    getDocs(query(collection(db, 'sales'), where('clientIds', 'array-contains', clientId))),
    getDocs(query(collection(db, 'clientPacks'), where('clientId', '==', clientId))),
    getDocs(query(collection(db, 'clientSubscriptions'), where('clientId', '==', clientId))),
  ])

  const purchases: FirstPaidPurchase[] = []
  for (const d of groupSessions.docs) {
    const gs = d.data() as GroupSession
    for (const e of gs.enrollments ?? []) {
      if (e.clientId !== clientId || !(e.amountPaid > 0)) continue
      purchases.push({ date: toDate(e.paidAt) ?? toDate(e.enrolledAt) ?? gs.startAt.toDate(), label: gs.title })
    }
  }
  for (const [snap, kind] of [[sessions, 'Séance'], [sales, 'Vente']] as const) {
    for (const d of snap.docs) {
      const data = d.data()
      const p = ((data['paymentDistribution'] as ClientPayment[] | undefined) ?? []).find(x => x.clientId === clientId)
      if (!p || !(p.amountPaid > 0)) continue
      const name = (data['priceSnapshot'] as { serviceName?: string } | undefined)?.serviceName
      purchases.push({
        date: toDate(p.paidAt) ?? toDate(data['startAt'] as Timestamp | undefined) ?? toDate(data['createdAt'] as Timestamp | undefined) ?? new Date(0),
        label: name ? `${kind} — ${name}` : kind,
      })
    }
  }
  for (const d of packs.docs) {
    const data = d.data()
    if (!((data['amountPaid'] as number) > 0)) continue
    purchases.push({
      date: toDate(data['purchasedAt'] as Timestamp | undefined) ?? new Date(0),
      label: `Pack — ${(data['packSnapshot'] as { name: string }).name}`,
    })
  }
  for (const d of subscriptions.docs) {
    const data = d.data()
    if (!((data['amountPaid'] as number) > 0)) continue
    purchases.push({
      date: toDate(data['startAt'] as Timestamp | undefined) ?? new Date(0),
      label: `Abonnement — ${(data['planSnapshot'] as { name: string }).name}`,
    })
  }

  return purchases.sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null
}

export function setReferralRewarded(filleulClientId: string, rewarded: boolean): Promise<void> {
  return updateDocById('clients', filleulClientId, {
    referralRewardedAt: rewarded ? serverTimestamp() : deleteField(),
  })
}
