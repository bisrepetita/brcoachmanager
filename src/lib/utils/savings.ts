import type { PackPlan, SubscriptionPlan } from '@/types'

// Économie par séance qu'apporterait un pack ou un abonnement par rapport au prix d'une séance à
// l'unité — affichée sur la fiche d'une séance collective pour inciter à passer à une formule.

export interface SavingOffer {
  kind: 'pack' | 'subscription'
  id: string
  name: string
  /** Coût d'une séance avec la formule */
  perSession: number
  /** Économie par séance, en CHF */
  saving: number
  /** Économie en pourcentage du prix à l'unité (arrondi) */
  savingPct: number
  detail: string
}

const WEEKS_PER_MONTH = 52 / 12

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toOffer(base: Omit<SavingOffer, 'saving' | 'savingPct'>, unitPrice: number): SavingOffer | null {
  const saving = round2(unitPrice - base.perSession)
  if (unitPrice <= 0 || saving <= 0) return null
  return { ...base, saving, savingPct: Math.round((saving / unitPrice) * 100) }
}

export function packOffers(plans: PackPlan[], serviceId: string | undefined, unitPrice: number): SavingOffer[] {
  if (!serviceId) return []
  return plans
    .filter(p => p.serviceIds.includes(serviceId) && p.sessionCount > 0)
    .map(p => toOffer({
      kind: 'pack', id: p.id, name: p.name,
      perSession: round2(p.price / p.sessionCount),
      detail: `${p.sessionCount} séances à utiliser quand tu veux`,
    }, unitPrice))
    .filter((o): o is SavingOffer => o !== null)
}

/**
 * Abonnements qui couvriraient cette séance. Le coût par séance suppose que toutes les séances de
 * la semaine sont utilisées pendant toute la durée de l'abonnement. Un abonnement à créneau fixe
 * n'est retenu que si le jour et l'heure de la séance sont connus et correspondent.
 */
export function subscriptionOffers(
  plans: SubscriptionPlan[],
  session: { serviceId?: string; dayOfWeek?: number; startTime?: string },
  unitPrice: number,
): SavingOffer[] {
  if (!session.serviceId) return []
  return plans
    .filter(p => p.serviceIds.includes(session.serviceId!))
    .filter(p => !p.fixedSlot || (
      p.fixedSlot.serviceId === session.serviceId &&
      p.fixedSlot.dayOfWeek === session.dayOfWeek &&
      p.fixedSlot.startTime === session.startTime
    ))
    .map(p => {
      const weeks = p.durationUnit === 'weeks' ? p.durationValue : p.durationValue * WEEKS_PER_MONTH
      const sessions = Math.max(1, Math.round(p.sessionsPerWeek * weeks))
      return toOffer({
        kind: 'subscription', id: p.id, name: p.name,
        perSession: round2(p.price / sessions),
        detail: `${p.sessionsPerWeek}x par semaine, si tu viens chaque semaine`,
      }, unitPrice)
    })
    .filter((o): o is SavingOffer => o !== null)
}
