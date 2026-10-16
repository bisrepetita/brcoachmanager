// Offre temporaire sur un pack ou une formule d'abonnement : badge affiché au client (texte libre,
// « Offre limitée » par défaut) et date de fin facultative, après laquelle l'offre n'est plus
// proposée ni achetable. Partagé client/serveur.

export const DEFAULT_LIMITED_OFFER_LABEL = 'Offre limitée'

interface TimestampLike { toMillis(): number; toDate(): Date }

export interface LimitedOfferFields {
  limitedOffer?: boolean
  limitedOfferLabel?: string
  limitedOfferEndsAt?: TimestampLike
}

/** Offre temporaire dont la date de fin est dépassée. */
export function isLimitedOfferExpired(plan: LimitedOfferFields, now: number = Date.now()): boolean {
  return !!plan.limitedOffer && !!plan.limitedOfferEndsAt && plan.limitedOfferEndsAt.toMillis() < now
}

/** Texte du badge (« Offre limitée · jusqu'au 31 octobre »), ou null si ce n'est pas une offre temporaire. */
export function limitedOfferBadge(plan: LimitedOfferFields): string | null {
  if (!plan.limitedOffer) return null
  const label = plan.limitedOfferLabel?.trim() || DEFAULT_LIMITED_OFFER_LABEL
  if (!plan.limitedOfferEndsAt) return label
  const until = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'long' })
    .format(plan.limitedOfferEndsAt.toDate())
  return `${label} · jusqu'au ${until}`
}
