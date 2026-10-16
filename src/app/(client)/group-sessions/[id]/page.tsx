'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot, getDoc } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, Tag, Repeat, MapPin, ChevronDown, ChevronUp, X, Check } from 'lucide-react'
import { db } from '@/lib/firebase/firestore'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useAuth } from '@/lib/hooks/useAuth'
import { enrollInGroupSession, cancelGroupSessionEnrollment, requestGroupSessionPaymentLink, checkGroupSessionOverlap } from '@/lib/services/group-session.service'
import { findActiveClientDiscount, computeDiscountedAmount, discountLabel } from '@/lib/services/discount.service'
import {
  findActiveSubscriptionForClient, matchesSubscriptionCoverage, countWeeklySubscriptionConsumptions,
} from '@/lib/services/subscription.service'
import { findClientPacks, isPackUsable } from '@/lib/services/pack.service'
import { GROUP_SESSION_LEVEL_LABELS, type GroupSession, type Discount, type ClientSubscription, type Building, type ClientPack } from '@/types'
import { REFERRAL_FREE_LABEL } from '@/lib/utils/referral'
import { useClientSettings } from '@/lib/hooks/useClientSettings'
import {
  C, card, iconCircle, arrowCircle, primaryButton, secondaryButton, hint, pageTitle, DateBox, Pill, coachFirstNames,
} from '@/components/client/ClientUI'
import { BrandLoader } from '@/components/shared/BrandLoader'

interface PublicGroupSessionView {
  id: string
  title: string
  description?: string
  coachNames?: string[]
  startAt: string
  endAt?: string
  maxParticipants: number
  price: number
  level?: GroupSession['level']
  confirmedCount: number
  accessInstructions?: string
  accessPhotos?: string[]
}

export default function ClientGroupSessionDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { profile, loading: profileLoading } = useClientProfile()
  const { firebaseUser, loading: authLoading } = useAuth()
  const [groupSession, setGroupSession] = useState<GroupSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [publicSession, setPublicSession] = useState<PublicGroupSessionView | null>(null)
  const [publicLoading, setPublicLoading] = useState(true)
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
  // Pack qui serait utilisé à l'inscription (même règle que le serveur : couvre le service, le plus
  // proche de l'expiration) — seulement si aucun abonnement ne couvre déjà la séance.
  const [coveringPack, setCoveringPack] = useState<ClientPack | null>(null)
  const [accessBuilding, setAccessBuilding] = useState<Building | null>(null)
  const [showAccessInfo, setShowAccessInfo] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const { deadlineHours } = useClientSettings()

  // Retour à la page précédente (accueil, planning, mes inscriptions…) ; planning à défaut
  // d'historique (lien ouvert depuis un mail).
  function goBack() {
    if (window.history.length > 1) router.back()
    else router.push('/group-sessions' as never)
  }

  // Client connecté : lecture Firestore directe temps réel (comportement existant, inchangé).
  // Anonyme : les règles Firestore exigent isClient()/isCoach(), donc on ne tente même pas la
  // lecture — on passe par la route publique redacted à la place (cf. effet suivant).
  useEffect(() => {
    if (authLoading || !firebaseUser) { setLoading(false); return }
    return onSnapshot(doc(db, 'groupSessions', params.id), snap => {
      setGroupSession(snap.exists() ? ({ id: snap.id, ...snap.data() } as GroupSession) : null)
      setLoading(false)
    }, () => setLoading(false))
  }, [params.id, firebaseUser, authLoading])

  useEffect(() => {
    if (authLoading || firebaseUser) { setPublicLoading(false); return }
    let cancelled = false
    fetch(`/api/group-sessions/public/${params.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setPublicSession(data) })
      .finally(() => { if (!cancelled) setPublicLoading(false) })
    return () => { cancelled = true }
  }, [params.id, firebaseUser, authLoading])

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

  // Lien "Voir le plan d'accès" du mail de confirmation — force le dépliage et scrolle jusqu'à la
  // section, même pour un habitué (profil déjà venu) chez qui elle est repliée par défaut.
  useEffect(() => {
    if (!accessBuilding || window.location.hash !== '#acces') return
    setShowAccessInfo(true)
    document.getElementById('acces')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [accessBuilding])

  // Couverture abonnement — vérifiée en premier (revenu déjà encaissé), avant la gratuité
  // "1ère réservation" et les remises (pas de cumul, même priorité que côté serveur).
  // Séance de groupe privé : ni abonnement, ni remise, ni gratuité — seule la participation compte.
  const isPrivate = !!groupSession?.privateGroupId

  useEffect(() => {
    if (!profile || !groupSession || !firebaseUser?.uid || groupSession.privateGroupId) { setActiveSubscription(null); setSubscriptionCovers(false); setSubscriptionQuotaOk(false); return }
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

  // Change à chaque inscription/désinscription du client sur cette séance : force la relecture du
  // solde du pack (sinon le bouton garde l'ancien nombre de séances restantes).
  const myEnrollmentKey = (groupSession?.enrollments ?? [])
    .filter(e => profile && e.clientId === profile.clientId)
    .map(e => e.status)
    .join(',')

  useEffect(() => {
    const serviceId = groupSession?.serviceId
    if (!profile || !firebaseUser?.uid || !serviceId || groupSession?.privateGroupId || (subscriptionCovers && subscriptionQuotaOk)) {
      setCoveringPack(null); return
    }
    let cancelled = false
    findClientPacks(profile.clientId, firebaseUser.uid)
      .then(list => {
        if (!cancelled) setCoveringPack(list.find(p => isPackUsable(p) && p.packSnapshot.serviceIds.includes(serviceId)) ?? null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [profile, firebaseUser?.uid, groupSession?.serviceId, groupSession?.privateGroupId, subscriptionCovers, subscriptionQuotaOk, myEnrollmentKey])

  // Gratuité "1ère réservation" (à défaut d'un abonnement qui couvre déjà la séance) puis, à
  // défaut, rabais client auto-attribué — un code promo ne sera proposé que si rien d'autre ne
  // s'applique déjà (pas de cumul).
  useEffect(() => {
    if (!profile || !groupSession?.serviceId || groupSession.privateGroupId || coveringPack || (subscriptionCovers && subscriptionQuotaOk)) {
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
  }, [profile, groupSession?.serviceId, groupSession?.privateGroupId, coveringPack, subscriptionCovers, subscriptionQuotaOk])

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

  // Séance offerte du parrainage : prioritaire sur abonnement/pack (même règle que la route enroll)
  const referralFree = !groupSession?.privateGroupId && !!profile?.referralFreeSessionAvailable

  async function handleCancel() {
    setBusy(true)
    setError('')
    try {
      await cancelGroupSessionEnrollment(params.id)
      setConfirmingCancel(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'annulation.')
    } finally {
      setBusy(false)
    }
  }

  // Visiteur non connecté : rendu simplifié à partir de la route publique redacted — pas de
  // vérification abonnement/remise/inscription (nécessitent une identité client), juste le prix
  // de base et un bouton qui renvoie vers la connexion.
  if (!authLoading && !firebaseUser) {
    if (publicLoading) return <Shell onBack={goBack}><BrandLoader fullScreen /></Shell>
    if (!publicSession) return <Shell onBack={goBack}><p style={loadingText}>Séance introuvable.</p></Shell>

    const isFull = publicSession.confirmedCount >= publicSession.maxParticipants
    const loginHref = `/login?redirect=${encodeURIComponent(`/group-sessions/${params.id}`)}`

    return (
      <Shell onBack={goBack} level={publicSession.level}>
        <SessionHeader
          title={publicSession.title}
          startAt={new Date(publicSession.startAt)}
          endAt={publicSession.endAt ? new Date(publicSession.endAt) : undefined}
          coachNames={publicSession.coachNames}
        />
        <StatsRow
          confirmedCount={publicSession.confirmedCount}
          maxParticipants={publicSession.maxParticipants}
          price={<PriceValue finalPrice={publicSession.price} />}
        />
        {publicSession.description && <DescriptionCard text={publicSession.description} />}
        {(publicSession.accessInstructions || (publicSession.accessPhotos?.length ?? 0) > 0) && (
          <AccessCard
            instructions={publicSession.accessInstructions}
            photos={publicSession.accessPhotos}
            open
            onPhoto={setLightboxUrl}
          />
        )}
        {isFull ? (
          <button disabled style={{ ...primaryButton, background: C.soft, color: C.muted, cursor: 'not-allowed' }}>Complet</button>
        ) : (
          <Link href={loginHref as never} style={{ ...primaryButton, height: 50 }}>Se connecter pour réserver</Link>
        )}
        {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      </Shell>
    )
  }

  if (loading || profileLoading) return <Shell onBack={goBack}><BrandLoader fullScreen /></Shell>
  if (!groupSession) return <Shell onBack={goBack}><p style={loadingText}>Séance introuvable.</p></Shell>

  const confirmedCount = groupSession.enrollments.filter(e => e.status !== 'cancelled').length
  const isFull = confirmedCount >= groupSession.maxParticipants
  const myEnrollment = profile
    ? groupSession.enrollments.find(e => e.clientId === profile.clientId && e.status !== 'cancelled')
    : undefined
  const startAt = groupSession.startAt?.toDate?.()
  const tooLateToCancel = !!startAt && Date.now() > startAt.getTime() - deadlineHours * 3600_000
  const viaClassPass = !!myEnrollment?.classPassBookingId

  // Prix affiché : même priorité que la route enroll (parrainage > abonnement > pack > 1re
  // réservation offerte > remise) — ou, une fois inscrit, ce qui a réellement été appliqué.
  const subscriptionCoveredNow = !referralFree && subscriptionCovers && subscriptionQuotaOk
  const packNow = !referralFree && !subscriptionCoveredNow && !!coveringPack
  const priceNode = isPrivate ? (
    <PriceValue finalPrice={groupSession.price} free={groupSession.price === 0} />
  ) : (() => {
    const originalPrice = myEnrollment
      ? (myEnrollment.clientPackId ? groupSession.price : myEnrollment.originalAmountDue)
      : (referralFree || subscriptionCoveredNow || packNow || firstBookingFree || clientDiscount) ? groupSession.price : undefined
    const finalPrice = myEnrollment
      ? myEnrollment.amountDue
      : referralFree || subscriptionCoveredNow || packNow || firstBookingFree ? 0 : clientDiscount ? computeDiscountedAmount(groupSession.price, clientDiscount) : groupSession.price
    const label = myEnrollment
      ? (myEnrollment.clientPackId ? 'Pack' : myEnrollment.discountLabel)
      : referralFree ? REFERRAL_FREE_LABEL : subscriptionCoveredNow ? 'Abonnement' : packNow ? 'Pack' : firstBookingFree ? 'Première réservation offerte' : clientDiscount ? discountLabel(clientDiscount) : undefined
    return <PriceValue finalPrice={finalPrice} originalPrice={originalPrice} label={label && (PLAIN_LABELS.includes(label) ? label : `Remise ${label}`)} />
  })()

  const enrollLabel = isFull ? 'Complet'
    : busy ? 'Inscription…'
    : isPrivate ? (groupSession.price === 0 ? 'S\'inscrire gratuitement' : 'S\'inscrire')
    : referralFree ? 'Réserver ma séance offerte'
    : (subscriptionCovers && subscriptionQuotaOk) ? 'Réserver avec mon abonnement'
    : coveringPack ? `Réserver avec mon pack · ${coveringPack.creditsRemaining} restante${coveringPack.creditsRemaining > 1 ? 's' : ''}`
    : firstBookingFree ? 'S\'inscrire gratuitement'
    : 'Réserver'

  return (
    <Shell onBack={goBack} level={groupSession.level}>
      <SessionHeader
        title={groupSession.title}
        subtitle={isPrivate ? groupSession.privateGroupName : undefined}
        startAt={startAt}
        endAt={groupSession.endAt?.toDate?.()}
        coachNames={groupSession.coachNames}
        status={myEnrollment
          ? (myEnrollment.status === 'confirmed'
            ? <Pill tone="green"><Check size={13} strokeWidth={2.5} />Réservation confirmée</Pill>
            : <Pill tone="amber">Place réservée · paiement en attente</Pill>)
          : undefined}
      />

      <StatsRow
        confirmedCount={confirmedCount}
        maxParticipants={groupSession.maxParticipants}
        priceLabel={isPrivate ? 'Participation' : 'Prix'}
        price={priceNode}
      />

      {groupSession.description && <DescriptionCard text={groupSession.description} />}

      {accessBuilding && (accessBuilding.accessInstructions || (accessBuilding.photos?.length ?? 0) > 0) && (
        <AccessCard
          instructions={accessBuilding.accessInstructions}
          photos={accessBuilding.photos}
          open={showAccessInfo}
          onToggle={() => setShowAccessInfo(v => !v)}
          onPhoto={setLightboxUrl}
        />
      )}

      {error && <Notice tone="red">{error}</Notice>}

      {hasOverlap && !myEnrollment && (
        <Notice tone="amber">
          Tu as déjà une autre séance sur ce créneau. Tu peux quand même t&apos;inscrire, mais vérifie qu&apos;il n&apos;y a pas de conflit.
        </Notice>
      )}

      {!profile ? (
        <p style={{ ...hint, textAlign: 'center' }}>
          Ton compte n&apos;est pas encore lié à une fiche client. Contacte ton coach.
        </p>
      ) : myEnrollment ? (
        confirmingCancel ? (
          <div style={card}>
            <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Annuler ta réservation ?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCancel} disabled={busy} style={{ ...primaryButton, flex: 1 }}>
                {busy ? 'Annulation…' : 'Oui, annuler'}
              </button>
              <button onClick={() => setConfirmingCancel(false)} disabled={busy} style={secondaryButton}>Garder</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8 }}>
              {myEnrollment.status === 'confirmed' ? (
                <a href={`/api/group-sessions/calendar/${groupSession.id}`} style={{ ...primaryButton, flex: 1, height: 50 }}>Ajouter au calendrier</a>
              ) : (
                <button onClick={handlePay} disabled={busy} style={{ ...primaryButton, flex: 1, height: 50 }}>
                  {busy ? 'Chargement…' : 'Payer maintenant'}
                </button>
              )}
              <button
                onClick={() => setConfirmingCancel(true)}
                disabled={busy || tooLateToCancel || viaClassPass}
                style={{
                  ...secondaryButton, height: 50,
                  opacity: tooLateToCancel || viaClassPass ? 0.4 : 1,
                  cursor: tooLateToCancel || viaClassPass ? 'default' : 'pointer',
                }}
              >
                Annuler
              </button>
            </div>
            {viaClassPass ? (
              <p style={hint}>Réservée via ClassPass : l&apos;annulation se fait dans l&apos;app ClassPass.</p>
            ) : tooLateToCancel && (
              <p style={hint}>Annulation impossible à moins de {deadlineHours} h du début. Contacte ton coach.</p>
            )}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeSubscription && !referralFree && !(subscriptionCovers && subscriptionQuotaOk) && !coveringPack && (
            <Notice tone="neutral" icon={<Repeat size={15} strokeWidth={1.75} />}>
              {subscriptionCovers
                ? 'Tu as déjà utilisé toutes tes séances de la semaine avec ton abonnement.'
                : 'Cette séance n\'est pas incluse dans ton abonnement actuel.'}
              {' '}Tu peux payer le prix normal, ou{' '}
              <Link href="/subscriptions" style={{ color: C.ink, fontWeight: 600 }}>voir les abonnements</Link>.
            </Notice>
          )}
          {!isPrivate && !referralFree && !(subscriptionCovers && subscriptionQuotaOk) && !coveringPack && !clientDiscount && !firstBookingFree && !isFull && (
            showPromoInput ? (
              <input
                autoFocus
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                placeholder="Code promo"
                style={{
                  height: 46, borderRadius: 9999, border: `1px solid ${C.border}`, padding: '0 18px', fontSize: 14,
                  background: C.card, outline: 'none', fontFamily: 'inherit', color: C.ink,
                }}
              />
            ) : (
              <button onClick={() => setShowPromoInput(true)} style={{ ...secondaryButton, borderStyle: 'dashed', gap: 8 }}>
                <Tag size={14} strokeWidth={1.75} />
                J&apos;ai un code promo
              </button>
            )
          )}
          <button
            onClick={handleEnroll}
            disabled={busy || isFull}
            style={{
              ...primaryButton, height: 50,
              ...(isFull ? { background: C.soft, color: C.muted, cursor: 'not-allowed' } : {}),
            }}
          >
            {enrollLabel}
          </button>
        </div>
      )}

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </Shell>
  )
}

// Libellés de prix affichés tels quels (les autres sont des remises : « Remise -20% … »)
const PLAIN_LABELS = ['Pack', 'Abonnement', REFERRAL_FREE_LABEL, 'Première réservation offerte']

const loadingText: React.CSSProperties = { color: C.muted, fontSize: 14, textAlign: 'center', padding: '40px 0' }

function Shell({ onBack, level, children }: { onBack: () => void; level?: GroupSession['level']; children: React.ReactNode }) {
  return (
    <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
        <button
          onClick={onBack}
          aria-label="Retour"
          className="press-effect"
          style={{ width: 38, height: 38, borderRadius: 9999, border: 'none', background: '#E0E0DF', color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={18} />
        </button>
        {level && <Pill tone="neutral">{GROUP_SESSION_LEVEL_LABELS[level]}</Pill>}
      </header>
      {children}
    </div>
  )
}

function SessionHeader({ title, subtitle, startAt, endAt, coachNames, status }: {
  title: string
  subtitle?: string
  startAt?: Date
  endAt?: Date
  coachNames?: string[]
  status?: React.ReactNode
}) {
  const coaches = coachFirstNames(coachNames)
  return (
    <>
      <div style={{ margin: '20px 0 8px' }}>
        <h1 style={pageTitle}>{title}</h1>
        {subtitle && <p style={{ margin: '6px 0 0', fontSize: 15, color: C.muted }}>{subtitle}</p>}
      </div>
      {startAt && (
        <div style={{ ...card, background: C.charcoal, color: '#fff' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <DateBox date={startAt} light />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 600, textTransform: 'capitalize' }}>
                {format(startAt, 'EEEE d MMMM', { locale: fr })}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
                {format(startAt, 'HH:mm')}{endAt && ` – ${format(endAt, 'HH:mm')}`}{coaches && ` · avec ${coaches}`}
              </p>
            </div>
          </div>
          {status && <div style={{ marginTop: 14 }}>{status}</div>}
        </div>
      )}
    </>
  )
}

function StatsRow({ confirmedCount, maxParticipants, price, priceLabel = 'Prix' }: {
  confirmedCount: number
  maxParticipants: number
  price: React.ReactNode
  priceLabel?: string
}) {
  const spotsLeft = Math.max(0, maxParticipants - confirmedCount)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ ...card, padding: 16, background: C.stone }}>
        <p style={statLabel}>Places</p>
        {spotsLeft === 0 ? (
          <p style={{ ...statValue, color: C.red }}>Complet</p>
        ) : (
          <p style={statValue}>{spotsLeft} <span style={{ fontSize: 14, fontWeight: 500, color: C.muted }}>restante{spotsLeft > 1 ? 's' : ''}</span></p>
        )}
        <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{confirmedCount}/{maxParticipants} inscrits</p>
      </div>
      <div style={{ ...card, padding: 16, background: C.stone }}>
        <p style={statLabel}>{priceLabel}</p>
        {price}
      </div>
    </div>
  )
}

function PriceValue({ finalPrice, originalPrice, label, free }: { finalPrice: number; originalPrice?: number; label?: string; free?: boolean }) {
  const discounted = originalPrice !== undefined
  return (
    <>
      <p style={{ ...statValue, color: discounted || free ? C.green : C.ink }}>
        {free || (discounted && finalPrice === 0) ? 'Gratuit' : `${finalPrice.toFixed(2)} CHF`}
      </p>
      {discounted && (
        <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted, textDecoration: 'line-through' }}>{originalPrice.toFixed(2)} CHF</p>
      )}
      {label && <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: C.green, lineHeight: 1.3 }}>{label}</p>}
    </>
  )
}

function DescriptionCard({ text }: { text: string }) {
  return (
    <div style={card}>
      <p style={statLabel}>À propos</p>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{text}</p>
    </div>
  )
}

function AccessCard({ instructions, photos, open, onToggle, onPhoto }: {
  instructions?: string
  photos?: string[]
  open: boolean
  onToggle?: () => void
  onPhoto: (url: string) => void
}) {
  return (
    <div id="acces" style={{ ...card, padding: 16 }}>
      <button
        onClick={onToggle}
        disabled={!onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: 'none', border: 'none', padding: 0, cursor: onToggle ? 'pointer' : 'default', textAlign: 'left', color: C.ink, fontFamily: 'inherit' }}
      >
        <span style={{ ...iconCircle, background: C.stone }}><MapPin size={18} strokeWidth={1.75} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Comment nous trouver</span>
          <span style={{ display: 'block', fontSize: 13, color: C.muted, marginTop: 2 }}>Accès au studio{photos && photos.length > 0 ? ' et photos' : ''}</span>
        </span>
        {onToggle && (
          <span style={{ ...arrowCircle, background: C.bg }}>
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        )}
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          {instructions && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{instructions}</p>}
          {photos && photos.length > 0 && (
            <div className="no-scrollbar" style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto' }}>
              {photos.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => onPhoto(url)}
                  style={{
                    width: 96, height: 96, borderRadius: 14, flexShrink: 0, border: 'none', padding: 0, cursor: 'zoom-in',
                    backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Notice({ tone, icon, children }: { tone: 'red' | 'amber' | 'neutral'; icon?: React.ReactNode; children: React.ReactNode }) {
  const [bg, fg] = { red: [C.redBg, C.red], amber: [C.amberBg, C.amber], neutral: [C.stone, C.ink] }[tone]
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderRadius: 18, background: bg, color: fg, fontSize: 13, lineHeight: 1.45 }}>
      {icon && <span style={{ flexShrink: 0, marginTop: 1, color: C.muted }}>{icon}</span>}
      <div>{children}</div>
    </div>
  )
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <button
        onClick={onClose}
        aria-label="Fermer"
        style={{
          position: 'absolute', top: 'calc(16px + env(safe-area-inset-top, 0px))', right: 16, width: 38, height: 38, borderRadius: 9999,
          background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={18} color="#fff" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 14, objectFit: 'contain' }} />
    </div>
  )
}

const statLabel: React.CSSProperties = { margin: '0 0 6px', fontSize: 12, fontWeight: 500, color: C.muted }
const statValue: React.CSSProperties = { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }
