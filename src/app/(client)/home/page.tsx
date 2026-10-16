'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { format } from 'date-fns'
import { getAuth } from 'firebase/auth'
import { ArrowRight, MessageSquare, Share } from 'lucide-react'
import { firebaseApp } from '@/lib/firebase/config'
import { useToast } from '@/components/ui/Toast'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { fetchMyPrivateGroupSessions } from '@/lib/services/group-session.service'
import type { GroupSession, GroupSessionEnrollmentStatus, PrivateSessionView } from '@/types'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { useClientSettings } from '@/lib/hooks/useClientSettings'
import { C, card, iconCircle, arrowCircle, primaryButton, secondaryButton, pageTitle, DateBox, coachFirstNames } from '@/components/client/ClientUI'
import { BrandLoader } from '@/components/shared/BrandLoader'

const PRIVATE_SESSION_MESSAGE = 'Bonjour, j\'aimerais réserver une séance privée.'

// Vue commune aux séances publiques (lecture Firestore) et aux séances de groupe privé (route API)
interface HomeSession {
  id: string
  title: string
  startAt: Date
  endAt: Date
  coachNames: string[]
  spotsLeft: number
  myStatus?: GroupSessionEnrollmentStatus
}

export default function ClientHomePage() {
  const { firebaseUser, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading } = useClientProfile()
  const signedIn = !!firebaseUser

  const [publicSessions, setPublicSessions] = useState<GroupSession[]>([])
  const [publicLoading, setPublicLoading] = useState(true)
  const [privateSessions, setPrivateSessions] = useState<PrivateSessionView[]>([])
  const { whatsappPhone } = useClientSettings()

  useEffect(() => {
    if (!signedIn) { setPublicLoading(false); return }
    const q = query(
      collection(db, 'groupSessions'),
      where('isPublic', '==', true),
      where('status', '==', 'planned'),
      where('startAt', '>=', Timestamp.now()),
      orderBy('startAt', 'asc'),
      limit(60),
    )
    return onSnapshot(q, snap => {
      setPublicSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupSession)))
      setPublicLoading(false)
    }, () => setPublicLoading(false))
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    fetchMyPrivateGroupSessions().then(list => { if (!cancelled) setPrivateSessions(list) })
    return () => { cancelled = true }
  }, [signedIn])

  const sessions = useMemo((): HomeSession[] => {
    const now = Date.now()
    const fromPublic = publicSessions.flatMap((gs): HomeSession[] => {
      if (!gs.startAt?.toDate || !gs.endAt?.toDate) return []
      const active = gs.enrollments.filter(e => e.status !== 'cancelled')
      const mine = profile ? active.find(e => e.clientId === profile.clientId) : undefined
      return [{
        id: gs.id, title: gs.title, startAt: gs.startAt.toDate(), endAt: gs.endAt.toDate(),
        coachNames: gs.coachNames ?? [],
        spotsLeft: gs.maxParticipants - active.length,
        myStatus: mine?.status,
      }]
    })
    const fromPrivate = privateSessions
      .filter(s => s.status === 'planned' && new Date(s.startAt).getTime() >= now)
      .map((s): HomeSession => ({
        id: s.id, title: s.title, startAt: new Date(s.startAt), endAt: new Date(s.endAt),
        coachNames: s.coachNames ?? [],
        spotsLeft: s.maxParticipants - s.confirmedCount,
        myStatus: s.myEnrollment?.status,
      }))
    return [...fromPublic, ...fromPrivate].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  }, [publicSessions, privateSessions, profile])

  const myUpcoming = sessions.filter(s => s.myStatus)
  const next = myUpcoming[0]
  const openSlots = sessions.filter(s => !s.myStatus && s.spotsLeft > 0).slice(0, 3)

  const loading = authLoading || profileLoading || publicLoading
  const initial = profile?.firstName.trim().charAt(0).toUpperCase() ?? ''
  const whatsappUrl = whatsappLink(whatsappPhone)

  return (
    <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
        <BrandLogo />
        {signedIn && (
          <Link
            href="/profile"
            aria-label="Mon profil"
            className="press-effect"
            style={{
              width: 38, height: 38, borderRadius: 9999, background: '#E0E0DF', color: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}
          >
            {initial}
          </Link>
        )}
      </header>

      <h1 style={{ ...pageTitle, margin: '40px 0 24px' }}>
        {authLoading || profileLoading ? ' ' : profile ? `Bonjour ${profile.firstName}` : 'Bonjour'}
      </h1>

      {!authLoading && !signedIn ? (
        <Link href={`/login?redirect=${encodeURIComponent('/home')}` as never} style={primaryButton}>
          Se connecter
        </Link>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <BrandLoader />
          ) : next ? (
            <NextSessionCard session={next} otherCount={myUpcoming.length - 1} />
          ) : (
            <OpenSlotsCard slots={openSlots} freeSession={!!profile?.referralFreeSessionAvailable} />
          )}

          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="press-effect" style={{ ...card, ...linkCard, background: C.stone }}>
              <span style={{ ...iconCircle, background: C.card }}><MessageSquare size={18} strokeWidth={1.75} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Envie d&apos;une séance privée ?</span>
                <span style={{ display: 'block', fontSize: 13, color: C.muted, marginTop: 2 }}>Écris-nous sur WhatsApp</span>
              </span>
              <span style={{ ...arrowCircle, background: C.card }}><ArrowRight size={14} /></span>
            </a>
          )}

          {profile && <ReferralCard />}
        </div>
      )}
    </div>
  )
}

// Partage du lien de parrainage via la feuille de partage du téléphone (WhatsApp, SMS…), ou copie
// du lien quand le navigateur ne sait pas partager (ordinateur).
function ReferralCard() {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  async function share() {
    setBusy(true)
    try {
      const token = await getAuth(firebaseApp).currentUser?.getIdToken()
      const res = await fetch('/api/referral/my-code', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const { url } = (await res.json()) as { url: string }
      const text = 'Viens t\'entraîner avec moi chez Bis Repetita : ta première séance est offerte avec mon lien !'
      if (navigator.share) {
        await navigator.share({ title: 'Bis Repetita', text, url }).catch(() => {})
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`)
        showToast('Lien copié', 'Colle-le dans un message à la personne que tu veux parrainer.')
      }
    } catch {
      showToast('Impossible de récupérer ton lien', 'Réessaie dans un instant.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button onClick={share} disabled={busy} className="press-effect" style={{ ...card, ...linkCard, background: C.graphite, color: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}>
      <span style={{ ...iconCircle, background: 'rgba(255,255,255,0.12)' }}><Share size={18} strokeWidth={1.75} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Parraine un proche</span>
        <span style={{ display: 'block', fontSize: 13, opacity: 0.75, marginTop: 2 }}>Sa première séance est offerte</span>
      </span>
      <span style={{ ...arrowCircle, background: 'rgba(255,255,255,0.12)' }}><ArrowRight size={14} /></span>
    </button>
  )
}

// Carte entièrement cliquable vers la fiche de la séance, où se trouvent les actions (ajout au
// calendrier, annulation, paiement).
function NextSessionCard({ session, otherCount }: { session: HomeSession; otherCount: number }) {
  const pending = session.myStatus === 'pending_payment'
  const coaches = coachFirstNames(session.coachNames)

  return (
    <div>
      <Link
        href={`/group-sessions/${session.id}` as never}
        className="press-effect"
        style={{ ...card, background: C.charcoal, color: '#fff', display: 'block', textDecoration: 'none' }}
      >
        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: onDarkMuted }}>
          Ta prochaine séance
        </p>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <DateBox date={session.startAt} light />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.25 }}>{session.title}</p>
            <p style={{ margin: '3px 0 0', fontSize: 14, color: onDarkMuted }}>
              {format(session.startAt, 'HH:mm')} – {format(session.endAt, 'HH:mm')}{coaches && ` · avec ${coaches}`}
            </p>
            {pending && <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: '#F2C374' }}>Paiement en attente</p>}
          </div>
          <span style={{ ...arrowCircle, background: 'rgba(255,255,255,0.14)' }}><ArrowRight size={14} /></span>
        </div>
      </Link>
      {otherCount > 0 && (
        <Link href="/my-enrollments" style={footerLink}>
          {otherCount === 1 ? 'Voir mon autre réservation' : `Voir mes ${otherCount} autres réservations`}
        </Link>
      )}
    </div>
  )
}

function OpenSlotsCard({ slots, freeSession }: { slots: HomeSession[]; freeSession: boolean }) {
  return (
    <div style={{ ...card, paddingBottom: 6 }}>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Aucune séance réservée</p>
      {freeSession && <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#2D7A4F' }}>Ta première séance est offerte grâce au parrainage</p>}
      <p style={{ margin: '2px 0 10px', fontSize: 13, color: C.muted }}>
        {slots.length > 0 ? 'Les prochains créneaux disponibles :' : 'Aucun créneau disponible pour le moment.'}
      </p>
      {slots.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: `1px solid ${C.line}` }}>
          <DateBox date={s.startAt} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{format(s.startAt, 'HH:mm')} – {format(s.endAt, 'HH:mm')}</p>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.35 }}>
              {s.title} · {s.spotsLeft} place{s.spotsLeft > 1 ? 's' : ''}
            </p>
          </div>
          <Link href={`/group-sessions/${s.id}` as never} style={{ ...secondaryButton, height: 38, padding: '0 16px', fontSize: 14 }}>
            Réserver
          </Link>
        </div>
      ))}
      <Link href="/group-sessions" style={{ ...footerLink, borderTop: `1px solid ${C.line}` }}>Voir tout le planning</Link>
    </div>
  )
}

/** Lien wa.me à partir d'un numéro saisi librement (« +41 79 … », « 079 … », « 0041 … »). */
function whatsappLink(phone: string): string | null {
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = '41' + digits.slice(1)
  return `https://wa.me/${digits}?text=${encodeURIComponent(PRIVATE_SESSION_MESSAGE)}`
}

const linkCard: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, padding: 16, color: C.ink, textDecoration: 'none' }
// Boutons et texte secondaire sur la carte anthracite de la prochaine séance
const onDarkMuted = 'rgba(255,255,255,0.65)'

const footerLink: React.CSSProperties = {
  display: 'block', textAlign: 'center', padding: '12px 0 4px', marginTop: 4, fontSize: 14, color: C.ink, textDecoration: 'none',
}
