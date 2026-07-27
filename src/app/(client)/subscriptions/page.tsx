'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { where } from 'firebase/firestore'
import { ChevronLeft, Repeat, Check } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCollection } from '@/lib/hooks/useCollection'
import { findActiveSubscriptionForClient, purchaseSubscriptionPlan } from '@/lib/services/subscription.service'
import { SUBSCRIPTION_DURATION_UNIT_LABELS, DAY_OF_WEEK_LABELS, type SubscriptionPlan, type ClientSubscription } from '@/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

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
    <>
      <TopBar
        title="Abonnements"
        left={
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={20} color="#1A1A18" />
          </button>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <p style={{ color: '#A09890', fontSize: 14, textAlign: 'center', padding: 40 }}>Chargement…</p>
        ) : (
          <>
            {activeSubscription && (
              <div style={{ background: '#1A1A18', borderRadius: 12, padding: 16, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Repeat size={16} />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Abonnement actif</p>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700 }}>{activeSubscription.planSnapshot.name}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
                  Jusqu&apos;au {format(activeSubscription.endAt.toDate(), 'd MMMM yyyy', { locale: fr })} · {activeSubscription.planSnapshot.sessionsPerWeek}x/semaine
                  {activeSubscription.planSnapshot.fixedSlot && ` · ${DAY_OF_WEEK_LABELS[activeSubscription.planSnapshot.fixedSlot.dayOfWeek]} ${activeSubscription.planSnapshot.fixedSlot.startTime}`}
                </p>
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FDECEA', color: '#C0392B', fontSize: 13 }}>
                {error}
              </div>
            )}

            {plans.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', gap: 12 }}>
                <Repeat size={44} color="#A09890" strokeWidth={1.5} />
                <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Aucun abonnement disponible</p>
                <p style={{ fontSize: 14, color: '#7A7570', margin: 0, textAlign: 'center' }}>
                  Contacte ton coach pour plus d&apos;informations.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plans.map(plan => {
                  const isThisOne = activeSubscription?.planId === plan.id
                  return (
                    <div key={plan.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: isThisOne ? '1px solid #1A1A18' : '1px solid #EEEAE3' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1A1A18' }}>{plan.name}</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1A1A18', fontFamily: 'monospace', flexShrink: 0 }}>
                          {plan.price.toFixed(2)} CHF
                        </p>
                      </div>
                      {plan.description && (
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7A7570' }}>{plan.description}</p>
                      )}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#1A1A18', background: '#F0EDE8', padding: '3px 8px', borderRadius: 20 }}>
                          {plan.durationValue} {SUBSCRIPTION_DURATION_UNIT_LABELS[plan.durationUnit]}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#1A1A18', background: '#F0EDE8', padding: '3px 8px', borderRadius: 20 }}>
                          {plan.sessionsPerWeek}x/semaine
                        </span>
                        {plan.fixedSlot && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#1A1A18', background: '#F0EDE8', padding: '3px 8px', borderRadius: 20 }}>
                            {DAY_OF_WEEK_LABELS[plan.fixedSlot.dayOfWeek]} {plan.fixedSlot.startTime}
                          </span>
                        )}
                      </div>

                      {isThisOne ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 10, background: '#E8F3EE', color: '#2D7A4F', fontSize: 13, fontWeight: 600, marginTop: 12 }}>
                          <Check size={14} /> Abonnement en cours
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePurchase(plan.id)}
                          disabled={!!activeSubscription || busyPlanId === plan.id}
                          style={{
                            width: '100%', height: 40, borderRadius: 10, border: 'none', marginTop: 12,
                            cursor: activeSubscription ? 'not-allowed' : 'pointer',
                            background: activeSubscription ? '#D5D1C9' : '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 600,
                          }}
                        >
                          {busyPlanId === plan.id ? 'Chargement...' : activeSubscription ? 'Déjà un abonnement actif' : !firebaseUser ? 'Se connecter pour souscrire' : 'Souscrire'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
