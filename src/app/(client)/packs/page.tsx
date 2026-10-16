'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { where } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, Ticket } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCollection } from '@/lib/hooks/useCollection'
import { findClientPacks, isPackUsable, purchasePackPlan } from '@/lib/services/pack.service'
import { SUBSCRIPTION_DURATION_UNIT_LABELS, type PackPlan, type ClientPack, type Service } from '@/types'
import { BrandLoader } from '@/components/shared/BrandLoader'

const chip: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#1A1A18', background: '#F0EDE8', padding: '3px 8px', borderRadius: 20 }

export default function ClientPacksPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useClientProfile()
  const { firebaseUser } = useAuth()
  const { data: plans, loading: plansLoading } = useCollection<PackPlan>('packPlans', [
    where('isPublic', '==', true),
    where('active', '==', true),
  ])
  const { data: services } = useCollection<Service>('services', [], { enabled: !!firebaseUser })
  const [myPacks, setMyPacks] = useState<ClientPack[]>([])
  const [packsLoading, setPacksLoading] = useState(true)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile || !firebaseUser?.uid) { setMyPacks([]); setPacksLoading(false); return }
    let cancelled = false
    findClientPacks(profile.clientId, firebaseUser.uid)
      .then(list => { if (!cancelled) setMyPacks(list.filter(p => isPackUsable(p))) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPacksLoading(false) })
    return () => { cancelled = true }
  }, [profile, firebaseUser?.uid])

  async function handlePurchase(planId: string) {
    if (!firebaseUser) {
      router.push(`/login?redirect=${encodeURIComponent('/packs')}` as never)
      return
    }
    setBusyPlanId(planId)
    setError('')
    try {
      const { checkoutUrl } = await purchasePackPlan(planId)
      window.location.href = checkoutUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'achat.')
      setBusyPlanId(null)
    }
  }

  const serviceNames = (ids: string[]) => ids.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(', ')
  const loading = profileLoading || plansLoading || packsLoading

  return (
    <>
      <TopBar
        title="Packs de séances"
        left={
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={20} color="#1A1A18" />
          </button>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <BrandLoader />
        ) : (
          <>
            {myPacks.map(pack => (
              <div key={pack.id} style={{ background: '#1A1A18', borderRadius: 12, padding: 16, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Ticket size={16} />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Mon pack</p>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700 }}>{pack.packSnapshot.name}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
                  {pack.creditsRemaining} séance{pack.creditsRemaining > 1 ? 's' : ''} restante{pack.creditsRemaining > 1 ? 's' : ''} sur {pack.creditsTotal}
                  {' · '}jusqu&apos;au {format(pack.expiresAt.toDate(), 'd MMMM yyyy', { locale: fr })}
                </p>
              </div>
            ))}

            {error && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FDECEA', color: '#C0392B', fontSize: 13 }}>
                {error}
              </div>
            )}

            {plans.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', gap: 12 }}>
                <Ticket size={44} color="#A09890" strokeWidth={1.5} />
                <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Aucun pack disponible</p>
                <p style={{ fontSize: 14, color: '#7A7570', margin: 0, textAlign: 'center' }}>
                  Contacte ton coach pour plus d&apos;informations.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plans.map(plan => (
                  <div key={plan.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #EEEAE3' }}>
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
                      <span style={chip}>{plan.sessionCount} séances</span>
                      <span style={chip}>valable {plan.validityValue} {SUBSCRIPTION_DURATION_UNIT_LABELS[plan.validityUnit]}</span>
                      <span style={chip}>{(plan.price / plan.sessionCount).toFixed(2)} CHF / séance</span>
                    </div>
                    {services.length > 0 && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#A09890' }}>Valable pour : {serviceNames(plan.serviceIds)}</p>
                    )}
                    <button
                      onClick={() => handlePurchase(plan.id)}
                      disabled={busyPlanId === plan.id}
                      style={{
                        width: '100%', height: 40, borderRadius: 10, border: 'none', marginTop: 12, cursor: 'pointer',
                        background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 600,
                      }}
                    >
                      {busyPlanId === plan.id ? 'Chargement...' : !firebaseUser ? 'Se connecter pour acheter' : 'Acheter'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
