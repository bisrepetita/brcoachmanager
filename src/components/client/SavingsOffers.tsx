'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { where } from 'firebase/firestore'
import { ArrowRight } from 'lucide-react'
import { useCollection } from '@/lib/hooks/useCollection'
import { packOffers, subscriptionOffers } from '@/lib/utils/savings'
import type { PackPlan, SubscriptionPlan } from '@/types'
import { C, card, arrowCircle, LimitedOfferBadge } from './ClientUI'

const MAX_OFFERS = 3

/**
 * Packs et abonnements qui rendraient cette séance moins chère, avec l'économie par séance.
 * Rien n'est affiché si aucune formule ne couvre la séance ou n'est plus avantageuse.
 */
export function SavingsOffers({ serviceId, dayOfWeek, startTime, unitPrice }: {
  serviceId?: string
  dayOfWeek?: number
  startTime?: string
  unitPrice: number
}) {
  // Formules publiques et actives — lisibles aussi sans connexion (cf. règles Firestore)
  const { data: packPlans } = useCollection<PackPlan>('packPlans', [where('isPublic', '==', true), where('active', '==', true)])
  const { data: subPlans } = useCollection<SubscriptionPlan>('subscriptionPlans', [where('isPublic', '==', true), where('active', '==', true)])

  const offers = useMemo(() => [
    ...packOffers(packPlans, serviceId, unitPrice),
    ...subscriptionOffers(subPlans, { serviceId, dayOfWeek, startTime }, unitPrice),
  ].sort((a, b) => b.savingPct - a.savingPct).slice(0, MAX_OFFERS), [packPlans, subPlans, serviceId, dayOfWeek, startTime, unitPrice])

  if (offers.length === 0) return null

  return (
    <div style={{ ...card, background: C.graphite, color: '#fff', padding: '18px 18px 8px' }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Paie moins cher tes séances</p>
      <p style={{ margin: '2px 0 6px', fontSize: 13, color: onDarkMuted }}>
        Cette séance coûte {formatChf(unitPrice)} CHF à l&apos;unité.
      </p>
      {offers.map(o => (
        <Link
          key={`${o.kind}-${o.id}`}
          href={(o.kind === 'pack' ? '/packs' : '/subscriptions') as never}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', color: '#fff', textDecoration: 'none',
            borderTop: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: onDarkMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {o.kind === 'pack' ? 'Pack' : 'Abonnement'}
            </p>
            <p style={{ margin: '1px 0 0', fontSize: 15, fontWeight: 600 }}>{o.name}</p>
            <p style={{ margin: '2px 0 0', fontSize: 14 }}>
              {formatChf(o.perSession)} CHF / séance · <span style={{ color: '#9BD3AE', fontWeight: 600 }}>tu économises {formatChf(o.saving)} CHF</span>
            </p>
            <p style={{ margin: '1px 0 0', fontSize: 12, color: onDarkMuted }}>{o.detail}</p>
            {o.badge && <div style={{ marginTop: 6 }}><LimitedOfferBadge text={o.badge} onDark /></div>}
          </div>
          <span style={{
            flexShrink: 0, padding: '4px 10px', borderRadius: 9999, background: C.greenBg, color: C.green,
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            −{o.savingPct} %
          </span>
          <span style={{ ...arrowCircle, background: 'rgba(255,255,255,0.12)' }}><ArrowRight size={14} /></span>
        </Link>
      ))}
    </div>
  )
}

const onDarkMuted = 'rgba(255,255,255,0.65)'

/** « 25 » plutôt que « 25.00 », mais « 22.50 » gardé tel quel. */
function formatChf(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2)
}
