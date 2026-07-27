'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot, getDoc } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, Tag, Repeat, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useAuth } from '@/lib/hooks/useAuth'
import { enrollInGroupSession, cancelGroupSessionEnrollment, requestGroupSessionPaymentLink, checkGroupSessionOverlap } from '@/lib/services/group-session.service'
import { findActiveClientDiscount, computeDiscountedAmount, discountLabel } from '@/lib/services/discount.service'
import {
  findActiveSubscriptionForClient, matchesSubscriptionCoverage, countWeeklySubscriptionConsumptions,
} from '@/lib/services/subscription.service'
import { GROUP_SESSION_LEVEL_LABELS, type GroupSession, type Discount, type ClientSubscription, type Building } from '@/types'

export default function ClientGroupSessionDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { profile, loading: profileLoading } = useClientProfile()
  const { firebaseUser } = useAuth()
  const [groupSession, setGroupSession] = useState<GroupSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hasOverlap, setHasOverlap] = useState(false)
  const [clientDiscount, setClientDiscount] = useState<Discount | null>(null)
  const [firstBookingFree, setFirstBookingFree] = useState(false)
  const [showPromoInput, setShowPromoInput] = useState(false)
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [activeSubscription, setActiveSubscription] = useState<ClientSubscription | null>(null)
  const [subscriptionCovers, setSubscriptionCovers] = useState(false)
  const [subscriptionQuotaOk, setSubscriptionQuotaOk] = useState(false)
  const [accessBuilding, setAccessBuilding] = useState<Building | null>(null)
  const [showAccessInfo, setShowAccessInfo] = useState(false)

  useEffect(() => {
    return onSnapshot(doc(db, 'groupSessions', params.id), snap => {
      setGroupSession(snap.exists() ? ({ id: snap.id, ...snap.data() } as GroupSession) : null)
      setLoading(false)
    }, () => setLoading(false))
  }, [params.id])

  useEffect(() => {
    if (!profile) return
    checkGroupSessionOverlap(params.id).then(({ hasOverlap }) => setHasOverlap(hasOverlap)).catch(() => {})
  }, [params.id, profile])

  // Instructions d'accès du bâtiment (partagées entre plusieurs Lieux au même endroit) — dépliées
  // par défaut pour un client qui n'a jamais réservé, repliées (juste un lien) pour les habitués.
  useEffect(() => {
    if (!groupSession?.locationId) { setAccessBuilding(null); return }
    let cancelled = false
    getDoc(doc(db, 'locations', groupSession.locationId)).then(async locSnap => {
      if (cancelled || !locSnap.exists()) return
      const buildingId = locSnap.data()['buildingId'] as string | undefined
      if (!buildingId) { setAccessBuilding(null); return }
      const buildingSnap = await getDoc(doc(db, 'buildings', buildingId))
      if (!cancelled) setAccessBuilding(buildingSnap.exists() ? ({ id: buildingSnap.id, ...buildingSnap.data() } as Building) : null)
    })
    return () => { cancelled = true }
  }, [groupSession?.locationId])

  useEffect(() => {
    if (profile) setShowAccessInfo(!profile.hasEverBooked)
  }, [profile])

  // Couverture abonnement — vérifiée en premier (revenu déjà encaissé), avant la gratuité
  // "1ère réservation" et les remises (pas de cumul, même priorité que côté serveur).
  useEffect(() => {
    if (!profile || !groupSession || !firebaseUser?.uid) { setActiveSubscription(null); setSubscriptionCovers(false); setSubscriptionQuotaOk(false); return }
    const uid = firebaseUser.uid
    let cancelled = false
    findActiveSubscriptionForClient(profile.clientId, uid).then(async sub => {
      if (cancelled) return
      setActiveSubscription(sub)
      if (!sub) { setSubscriptionCovers(false); setSubscriptionQuotaOk(false); return }
      const covers = matchesSubscriptionCoverage(sub.planSnapshot, groupSession)
      setSubscriptionCovers(covers)
      if (!covers) { setSubscriptionQuotaOk(false); return }
      const used = await countWeeklySubscriptionConsumptions(sub.id, groupSession.startAt.toDate(), uid)
      if (!cancelled) setSubscriptionQuotaOk(used < sub.planSnapshot.sessionsPerWeek)
    })
    return () => { cancelled = true }
  }, [profile, groupSession, firebaseUser?.uid])

  // Gratuité "1ère réservation" (à défaut d'un abonnement qui couvre déjà la séance) puis, à
  // défaut, rabais client auto-attribué — un code promo ne sera proposé que si rien d'autre ne
  // s'applique déjà (pas de cumul).
  useEffect(() => {
    if (!profile || !groupSession?.serviceId || (subscriptionCovers && subscriptionQuotaOk)) {
      setClientDiscount(null); setFirstBookingFree(false); return
    }
    let cancelled = false
    getDoc(doc(db, 'services', groupSession.serviceId)).then(async serviceSnap => {
      if (cancelled || !serviceSnap.exists()) return
      const service = { id: serviceSnap.id, isPublic: serviceSnap.data()['isPublic'] as boolean | undefined }
      if (serviceSnap.data()['firstBookingFree'] === true && !profile.hasEverBooked) {
        setFirstBookingFree(true)
        setClientDiscount(null)
        return
      }
      setFirstBookingFree(false)
      const d = await findActiveClientDiscount(profile.clientId, service)
      if (!cancelled) setClientDiscount(d ?? null)
    })
    return () => { cancelled = true }
  }, [profile, groupSession?.serviceId, subscriptionCovers, subscriptionQuotaOk])

  async function handleEnroll() {
    setBusy(true)
    setError('')
    try {
      const { checkoutUrl } = await enrollInGroupSession(params.id, promoCodeInput.trim() || undefined)
      if (checkoutUrl) window.location.href = checkoutUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'inscription.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePay() {
    setBusy(true)
    setError('')
    try {
      const { checkoutUrl } = await requestGroupSessionPaymentLink(params.id)
      window.location.href = checkoutUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la génération du lien de paiement.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Annuler ton inscription à cette séance ?')) return
    setBusy(true)
    setError('')
    try {
      await cancelGroupSessionEnrollment(params.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'annulation.')
    } finally {
      setBusy(false)
    }
  }

  if (loading || profileLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
      </div>
    )
  }

  if (!groupSession) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#A09890', fontSize: 14 }}>Séance introuvable.</p>
      </div>
    )
  }

  const confirmedCount = groupSession.enrollments.filter(e => e.status !== 'cancelled').length
  const isFull = confirmedCount >= groupSession.maxParticipants
  const myEnrollment = profile
    ? groupSession.enrollments.find(e => e.clientId === profile.clientId && e.status !== 'cancelled')
    : undefined
  const date = groupSession.startAt?.toDate ? format(groupSession.startAt.toDate(), 'EEEE d MMMM yyyy · HH:mm', { locale: fr }) : '—'

  return (
    <>
      <TopBar
        title={groupSession.title}
        left={
          <button onClick={() => router.push('/group-sessions' as never)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={20} color="#1A1A18" />
          </button>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 13, color: '#7A7570', margin: 0, textTransform: 'capitalize' }}>{date}</p>
            {groupSession.level && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#1A1A18', background: '#F0EDE8', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>
                {GROUP_SESSION_LEVEL_LABELS[groupSession.level]}
              </span>
            )}
          </div>
          {groupSession.coachNames && groupSession.coachNames.length > 0 && (
            <p style={{ fontSize: 13, color: '#7A7570', margin: '4px 0 0' }}>
              Avec <span style={{ fontWeight: 600, color: '#1A1A18' }}>{groupSession.coachNames.join(' & ')}</span>
            </p>
          )}
          {groupSession.description && (
            <p style={{ fontSize: 14, color: '#1A1A18', margin: '8px 0 0' }}>{groupSession.description}</p>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div>
              <p style={{ fontSize: 11, color: '#A09890', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Places</p>
              <p style={{ fontSize: 16, fontWeight: 600, color: isFull ? '#C0392B' : '#1A1A18', margin: '2px 0 0', fontFamily: 'monospace' }}>
                {confirmedCount}/{groupSession.maxParticipants}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#A09890', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prix</p>
              {(() => {
                const subscriptionCoveredNow = subscriptionCovers && subscriptionQuotaOk
                const originalPrice = myEnrollment
                  ? myEnrollment.originalAmountDue
                  : (subscriptionCoveredNow || firstBookingFree || clientDiscount) ? groupSession.price : undefined
                const finalPrice = myEnrollment
                  ? myEnrollment.amountDue
                  : subscriptionCoveredNow ? 0 : firstBookingFree ? 0 : clientDiscount ? computeDiscountedAmount(groupSession.price, clientDiscount) : groupSession.price
                const label = myEnrollment
                  ? myEnrollment.discountLabel
                  : subscriptionCoveredNow ? 'Abonnement' : firstBookingFree ? 'Première réservation offerte' : clientDiscount ? discountLabel(clientDiscount) : undefined
                return (
                  <>
                    <p style={{ fontSize: 16, fontWeight: 600, margin: '2px 0 0', fontFamily: 'monospace' }}>
                      {originalPrice !== undefined && (
                        <span style={{ textDecoration: 'line-through', color: '#A09890', marginRight: 6, fontSize: 13 }}>
                          {originalPrice.toFixed(2)} CHF
                        </span>
                      )}
                      <span style={{ color: originalPrice !== undefined ? '#2D7A4F' : '#1A1A18' }}>{finalPrice.toFixed(2)} CHF</span>
                    </p>
                    {label && <p style={{ fontSize: 11, color: '#2D7A4F', margin: '2px 0 0' }}>Remise {label}</p>}
                  </>
                )
              })()}
            </div>
          </div>
        </div>

        {accessBuilding && (accessBuilding.accessInstructions || (accessBuilding.photos && accessBuilding.photos.length > 0)) && (
          <div style={{ background: '#fff', borderRadius: 10, padding: 14 }}>
            <button
              onClick={() => setShowAccessInfo(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <MapPin size={15} color="#7A7570" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#1A1A18' }}>Comment nous trouver</span>
              {showAccessInfo ? <ChevronUp size={16} color="#A09890" /> : <ChevronDown size={16} color="#A09890" />}
            </button>
            {showAccessInfo && (
              <div style={{ marginTop: 10 }}>
                {accessBuilding.accessInstructions && (
                  <p style={{ fontSize: 13, color: '#1A1A18', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {accessBuilding.accessInstructions}
                  </p>
                )}
                {accessBuilding.photos && accessBuilding.photos.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
                    {accessBuilding.photos.map((url, idx) => (
                      <div key={idx} style={{ width: 90, height: 90, borderRadius: 8, flexShrink: 0, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FDECEA', color: '#C0392B', fontSize: 13 }}>
            {error}
          </div>
        )}

        {hasOverlap && !myEnrollment && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FFF4E5', color: '#B26A00', fontSize: 13 }}>
            Tu as déjà une autre séance sur ce créneau. Tu peux quand même t&apos;inscrire, mais vérifie qu&apos;il n&apos;y a pas de conflit.
          </div>
        )}

        {!profile ? (
          <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center' }}>
            Ton compte n&apos;est pas encore lié à une fiche client. Contacte ton coach.
          </p>
        ) : myEnrollment ? (
          myEnrollment.status === 'confirmed' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#E8F3EE', color: '#2D7A4F', fontSize: 13, textAlign: 'center' }}>
                Inscription confirmée ✓
              </div>
              <button
                onClick={handleCancel}
                disabled={busy}
                style={{ height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#FDECEA', color: '#C0392B', fontSize: 14, fontWeight: 600 }}
              >
                Se désinscrire
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FFF4E5', color: '#B26A00', fontSize: 13, textAlign: 'center' }}>
                Place réservée — paiement en attente
              </div>
              <button
                onClick={handlePay}
                disabled={busy}
                style={{ height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#1A1A18', color: '#fff', fontSize: 14, fontWeight: 600 }}
              >
                {busy ? 'Chargement...' : 'Payer maintenant'}
              </button>
              <button
                onClick={handleCancel}
                disabled={busy}
                style={{ height: 40, borderRadius: 10, border: '1px solid #E5E1DA', cursor: 'pointer', background: '#fff', color: '#7A7570', fontSize: 13, fontWeight: 500 }}
              >
                Se désinscrire
              </button>
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeSubscription && !(subscriptionCovers && subscriptionQuotaOk) && (
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, background: '#F0EDE8', color: '#1A1A18', fontSize: 13 }}>
                <Repeat size={14} style={{ flexShrink: 0, marginTop: 2, color: '#7A7570' }} />
                <p style={{ margin: 0 }}>
                  {subscriptionCovers
                    ? 'Tu as déjà utilisé toutes tes séances de la semaine avec ton abonnement.'
                    : 'Cette séance n\'est pas incluse dans ton abonnement actuel.'}
                  {' '}Tu peux payer le prix normal ci-dessous, ou{' '}
                  <button onClick={() => router.push('/subscriptions' as never)} style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A18', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>
                    voir les abonnements
                  </button>.
                </p>
              </div>
            )}
            {!(subscriptionCovers && subscriptionQuotaOk) && !clientDiscount && !firstBookingFree && !isFull && (
              showPromoInput ? (
                <input
                  autoFocus
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                  placeholder="Code promo"
                  style={{ height: 40, borderRadius: 10, border: '1px solid #E5E1DA', padding: '0 12px', fontSize: 14, background: '#fff', outline: 'none' }}
                />
              ) : (
                <button
                  onClick={() => setShowPromoInput(true)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    height: 40, borderRadius: 10, border: '1px dashed #C8C4BC', background: '#F9F8F6',
                    color: '#1A1A18', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  <Tag size={14} style={{ color: '#7A7570' }} />
                  J&apos;ai un code promo
                </button>
              )
            )}
            <button
              onClick={handleEnroll}
              disabled={busy || isFull}
              style={{
                height: 44, borderRadius: 10, border: 'none', cursor: isFull ? 'not-allowed' : 'pointer',
                background: isFull ? '#D5D1C9' : '#1A1A18', color: '#fff', fontSize: 14, fontWeight: 600,
              }}
            >
              {isFull ? 'Complet' : busy ? 'Inscription...' : (subscriptionCovers && subscriptionQuotaOk) ? 'Réserver avec mon abonnement' : firstBookingFree ? 'S\'inscrire gratuitement' : 'S\'inscrire'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
