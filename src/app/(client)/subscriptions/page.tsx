'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { where } from 'firebase/firestore'
import { Repeat, Check } from 'lucide-react'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCollection } from '@/lib/hooks/useCollection'
import { findActiveSubscriptionForClient, purchaseSubscriptionPlan } from '@/lib/services/subscription.service'
import { SUBSCRIPTION_DURATION_UNIT_LABELS, DAY_OF_WEEK_LABELS, type SubscriptionPlan, type ClientSubscription } from '@/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { BrandLoader } from '@/components/shared/BrandLoader'
import { ClientPage, SectionTitle, EmptyCard, ErrorNotice } from '@/components/client/ClientPage'
import { C, card, primaryButton, Pill } from '@/components/client/ClientUI'

export default function ClientSubscriptionsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useClientProfile()
  const { firebaseUser } = useAuth()
  const { data: plans, loading: plansLoading } = useCollection<SubscriptionPlan>('subscriptionPlans', [
    where('isPublic', '==', true),
    where('active', '==', true),
  ])
  const [activeSubscription, setActiveSubscription] = useState<ClientSubscription | null>(null)
  const [subLoading, setSubLoading] = useState(true)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile || !firebaseUser?.uid) { setActiveSubscription(null); setSubLoading(false); return }
    let cancelled = false
    setSubLoading(true)
    findActiveSubscriptionForClient(profile.clientId, firebaseUser.uid)
      .then(sub => { if (!cancelled) setActiveSubscription(sub) })
      .finally(() => { if (!cancelled) setSubLoading(false) })
    return () => { cancelled = true }
  }, [profile, firebaseUser?.uid])

  async function handlePurchase(planId: string) {
    if (!firebaseUser) {
      router.push(`/login?redirect=${encodeURIComponent('/subscriptions')}` as never)
      return
    }
    setBusyPlanId(planId)
    setError('')
    try {
      const { checkoutUrl } = await purchaseSubscriptionPlan(planId)
      window.location.href = checkoutUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'achat.')
      setBusyPlanId(null)
    }
  }

  const loading = profileLoading || plansLoading || subLoading

  return (
    <ClientPage title="Abonnements" subtitle="Viens t'entraîner chaque semaine." back backFallback="/profile">
      {loading ? (
        <BrandLoader />
      ) : (
        <>
          {activeSubscription && (
            <div style={{ ...card, background: C.charcoal, color: '#fff' }}>
              <p style={{ ...overline, color: 'rgba(255,255,255,0.65)' }}>Ton abonnement</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{activeSubscription.planSnapshot.name}</p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
                Jusqu&apos;au {format(activeSubscription.endAt.toDate(), 'd MMMM yyyy', { locale: fr })} · {activeSubscription.planSnapshot.sessionsPerWeek}x/semaine
                {activeSubscription.planSnapshot.fixedSlot && ` · ${DAY_OF_WEEK_LABELS[activeSubscription.planSnapshot.fixedSlot.dayOfWeek]} ${activeSubscription.planSnapshot.fixedSlot.startTime}`}
              </p>
            </div>
          )}

          {error && <ErrorNotice>{error}</ErrorNotice>}

          {plans.length === 0 ? (
            <EmptyCard
              icon={<Repeat size={18} strokeWidth={1.75} />}
              title="Aucun abonnement disponible"
              text="Contacte ton coach pour plus d'informations."
            />
          ) : (
            <>
              {activeSubscription && <SectionTitle>Les formules</SectionTitle>}
              {plans.map(plan => {
                const isThisOne = activeSubscription?.planId === plan.id
                return (
                  <div key={plan.id} style={{ ...card, outline: isThisOne ? `1.5px solid ${C.charcoal}` : undefined, outlineOffset: -1.5 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <p style={{ margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{plan.name}</p>
                      <p style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', flexShrink: 0 }}>
                        {formatChf(plan.price)} <span style={{ fontSize: 13, fontWeight: 500, color: C.muted }}>CHF</span>
                      </p>
                    </div>
                    {plan.description && <p style={{ margin: '6px 0 0', fontSize: 14, color: C.muted, lineHeight: 1.45 }}>{plan.description}</p>}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                      <Pill tone="neutral">{plan.durationValue} {SUBSCRIPTION_DURATION_UNIT_LABELS[plan.durationUnit]}</Pill>
                      <Pill tone="neutral">{plan.sessionsPerWeek}x/semaine</Pill>
                      {plan.fixedSlot && <Pill tone="neutral">{DAY_OF_WEEK_LABELS[plan.fixedSlot.dayOfWeek]} {plan.fixedSlot.startTime}</Pill>}
                    </div>

                    {isThisOne ? (
                      <div style={{ ...primaryButton, marginTop: 16, background: C.greenBg, color: C.green, gap: 6, cursor: 'default' }}>
                        <Check size={15} strokeWidth={2.5} /> Abonnement en cours
                      </div>
                    ) : (
                      <button
                        onClick={() => handlePurchase(plan.id)}
                        disabled={!!activeSubscription || busyPlanId === plan.id}
                        style={{
                          ...primaryButton, width: '100%', marginTop: 16,
                          ...(activeSubscription ? { background: C.soft, color: C.muted, cursor: 'not-allowed' } : {}),
                        }}
                      >
                        {busyPlanId === plan.id ? 'Chargement…' : activeSubscription ? 'Déjà un abonnement actif' : !firebaseUser ? 'Se connecter pour souscrire' : 'Souscrire'}
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </>
      )}
    </ClientPage>
  )
}

/** « 120 » plutôt que « 120.00 », mais « 99.50 » gardé tel quel. */
function formatChf(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2)
}

const overline: React.CSSProperties = { margin: '0 0 8px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }
