'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { where } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ticket } from 'lucide-react'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCollection } from '@/lib/hooks/useCollection'
import { findClientPacks, isPackUsable, purchasePackPlan } from '@/lib/services/pack.service'
import { SUBSCRIPTION_DURATION_UNIT_LABELS, type PackPlan, type ClientPack, type Service } from '@/types'
import { BrandLoader } from '@/components/shared/BrandLoader'
import { ClientPage, SectionTitle, EmptyCard, ErrorNotice } from '@/components/client/ClientPage'
import { C, card, primaryButton, Pill, LimitedOfferBadge } from '@/components/client/ClientUI'
import { isLimitedOfferExpired, limitedOfferBadge } from '@/lib/utils/limited-offer'


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

  // Offres temporaires terminées : plus proposées (l'achat est aussi refusé côté serveur)
  const offeredPlans = plans.filter(p => !isLimitedOfferExpired(p))
  const serviceNames = (ids: string[]) => ids.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(', ')
  const loading = profileLoading || plansLoading || packsLoading

  return (
    <ClientPage title="Packs de séances" subtitle="Un carnet de séances à utiliser quand tu veux." back backFallback="/profile">
      {loading ? (
        <BrandLoader />
      ) : (
        <>
          {myPacks.map(pack => {
            const used = pack.creditsTotal - pack.creditsRemaining
            return (
              <div key={pack.id} style={{ ...card, background: C.charcoal, color: '#fff' }}>
                <p style={{ ...overline, color: 'rgba(255,255,255,0.65)' }}>Ton pack</p>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{pack.packSnapshot.name}</p>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 600, flexShrink: 0 }}>
                    {pack.creditsRemaining}<span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>/{pack.creditsTotal}</span>
                  </p>
                </div>
                <div style={{ height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.14)', marginTop: 12, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(pack.creditsRemaining / pack.creditsTotal) * 100}%`, background: '#fff', borderRadius: 9999 }} />
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                  {pack.creditsRemaining} séance{pack.creditsRemaining > 1 ? 's' : ''} restante{pack.creditsRemaining > 1 ? 's' : ''}
                  {used > 0 && ` · ${used} utilisée${used > 1 ? 's' : ''}`}
                  {' · '}jusqu&apos;au {format(pack.expiresAt.toDate(), 'd MMMM yyyy', { locale: fr })}
                </p>
              </div>
            )
          })}

          {error && <ErrorNotice>{error}</ErrorNotice>}

          {offeredPlans.length === 0 ? (
            <EmptyCard
              icon={<Ticket size={18} strokeWidth={1.75} />}
              title="Aucun pack disponible"
              text="Contacte ton coach pour plus d'informations."
            />
          ) : (
            <>
              {myPacks.length > 0 && <SectionTitle>Acheter un pack</SectionTitle>}
              {offeredPlans.map(plan => (
                <div key={plan.id} style={card}>
                  {limitedOfferBadge(plan) && <div style={{ marginBottom: 10 }}><LimitedOfferBadge text={limitedOfferBadge(plan)!} /></div>}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{plan.name}</p>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', flexShrink: 0 }}>
                      {formatChf(plan.price)} <span style={{ fontSize: 13, fontWeight: 500, color: C.muted }}>CHF</span>
                    </p>
                  </div>
                  {plan.description && <p style={{ margin: '6px 0 0', fontSize: 14, color: C.muted, lineHeight: 1.45 }}>{plan.description}</p>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                    <Pill tone="neutral">{plan.sessionCount} séances</Pill>
                    <Pill tone="neutral">valable {plan.validityValue} {SUBSCRIPTION_DURATION_UNIT_LABELS[plan.validityUnit]}</Pill>
                    <Pill tone="green">{formatChf(Math.round((plan.price / plan.sessionCount) * 100) / 100)} CHF / séance</Pill>
                  </div>
                  {services.length > 0 && (
                    <p style={{ margin: '10px 0 0', fontSize: 13, color: C.muted }}>Valable pour : {serviceNames(plan.serviceIds)}</p>
                  )}
                  <button
                    onClick={() => handlePurchase(plan.id)}
                    disabled={busyPlanId === plan.id}
                    style={{ ...primaryButton, width: '100%', marginTop: 16, opacity: busyPlanId === plan.id ? 0.7 : 1 }}
                  >
                    {busyPlanId === plan.id ? 'Chargement…' : !firebaseUser ? 'Se connecter pour acheter' : 'Acheter'}
                  </button>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </ClientPage>
  )
}

/** « 220 » plutôt que « 220.00 », mais « 22.50 » gardé tel quel. */
function formatChf(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2)
}

const overline: React.CSSProperties = { margin: '0 0 8px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }
