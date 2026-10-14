// Reconnaissance du CA des packs et abonnements dans les statistiques (règles validées) :
// - pack : CA reconnu à l'usage — chaque séance réservée avec un crédit compte packCreditValue
//   (prix du pack / nombre de séances) à la date de la séance ; à l'expiration, les crédits
//   restants × la même valeur comptent à la date d'expiration. L'achat lui-même ne compte pas.
// - abonnement : prix réparti uniformément sur sa durée (au prorata du temps tombant dans la
//   période affichée).
// Un pack ou abonnement offert ne génère pas de CA.

interface TimestampLike { toMillis(): number }

export interface PackForRevenue {
  id: string
  status: string
  paymentStatus: string
  creditsRemaining: number
  expiresAt: TimestampLike
  packSnapshot: { name: string; price: number; sessionCount: number }
}

export interface SubscriptionForRevenue {
  status: string
  paymentStatus: string
  amountDue: number
  amountPaid: number
  startAt: TimestampLike
  endAt: TimestampLike
  planSnapshot: { name: string }
}

export function creditValueOf(pack: Pick<PackForRevenue, 'packSnapshot'>): number {
  return Math.round((pack.packSnapshot.price / pack.packSnapshot.sessionCount) * 100) / 100
}

/** CA et encaissé d'une inscription réglée par un crédit de pack. */
export function packEnrollmentRevenue(
  enrollment: { clientPackId?: string; packCreditValue?: number },
  packs: Map<string, PackForRevenue>,
): { revenue: number; paid: number } {
  if (!enrollment.clientPackId) return { revenue: 0, paid: 0 }
  const pack = packs.get(enrollment.clientPackId)
  if (pack?.paymentStatus === 'offered') return { revenue: 0, paid: 0 }
  const value = enrollment.packCreditValue ?? (pack ? creditValueOf(pack) : 0)
  return { revenue: value, paid: pack?.paymentStatus === 'paid' ? value : 0 }
}

/** Packs arrivés à expiration dans [start, end] (et déjà expirés à `now`) avec des crédits perdus. */
export function expiredPackRevenue(
  packs: PackForRevenue[], start: Date, end: Date, now = new Date(),
): Array<{ date: Date; revenue: number; paid: number; label: string }> {
  return packs
    .filter(p => p.status === 'active' && p.paymentStatus !== 'offered' && p.creditsRemaining > 0)
    .filter(p => {
      const t = p.expiresAt.toMillis()
      return t >= start.getTime() && t <= end.getTime() && t <= now.getTime()
    })
    .map(p => {
      const revenue = Math.round(p.creditsRemaining * creditValueOf(p) * 100) / 100
      return {
        date: new Date(p.expiresAt.toMillis()),
        revenue,
        paid: p.paymentStatus === 'paid' ? revenue : 0,
        label: p.packSnapshot.name,
      }
    })
}

/**
 * Part du prix de chaque abonnement qui tombe dans [start, end]. Ignorés : achats en ligne non
 * payés, abonnements offerts, et abonnements annulés sans rien encaissé (attribution par erreur).
 */
export function subscriptionRevenue(
  subs: SubscriptionForRevenue[], start: Date, end: Date,
): Array<{ date: Date; revenue: number; paid: number; label: string }> {
  return subs
    .filter(s => s.status !== 'pending_payment' && s.paymentStatus !== 'offered')
    .filter(s => s.status !== 'cancelled' || s.amountPaid > 0)
    .flatMap(s => {
      const from = s.startAt.toMillis()
      const to = s.endAt.toMillis()
      const total = to - from
      const overlap = Math.min(to, end.getTime()) - Math.max(from, start.getTime())
      if (total <= 0 || overlap <= 0) return []
      const ratio = overlap / total
      return [{
        date: new Date(Math.max(from, start.getTime())),
        revenue: Math.round(s.amountDue * ratio * 100) / 100,
        paid: Math.round(s.amountPaid * ratio * 100) / 100,
        label: s.planSnapshot.name,
      }]
    })
}
