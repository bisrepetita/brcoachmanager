'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowRight, MessageSquare } from 'lucide-react'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useCollection } from '@/lib/hooks/useCollection'
import { cancelGroupSessionEnrollment, fetchMyPrivateGroupSessions } from '@/lib/services/group-session.service'
import type { GroupSession, GroupSessionEnrollmentStatus, Location, PrivateSessionView } from '@/types'

const DEFAULT_CANCELLATION_DEADLINE_HOURS = 24
const PRIVATE_SESSION_MESSAGE = 'Bonjour, j\'aimerais réserver une séance privée.'

// Vue commune aux séances publiques (lecture Firestore) et aux séances de groupe privé (route API)
interface HomeSession {
  id: string
  title: string
  startAt: Date
  endAt: Date
  coachNames: string[]
  locationId?: string
  spotsLeft: number
  myStatus?: GroupSessionEnrollmentStatus
  viaClassPass?: boolean
}

const C = {
  bg: '#F1F1F0', card: '#FAFAFA', soft: '#E6E6E5', ink: '#1C1C1C', muted: '#6E6E6B', line: '#E3E3E1',
}

export default function ClientHomePage() {
  const router = useRouter()
  const { firebaseUser, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading } = useClientProfile()
  const signedIn = !!firebaseUser

  const [publicSessions, setPublicSessions] = useState<GroupSession[]>([])
  const [publicLoading, setPublicLoading] = useState(true)
  const [privateSessions, setPrivateSessions] = useState<PrivateSessionView[]>([])
  const [privateVersion, setPrivateVersion] = useState(0)
  const [deadlineHours, setDeadlineHours] = useState(DEFAULT_CANCELLATION_DEADLINE_HOURS)
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const { data: locations } = useCollection<Location>('locations', [], { enabled: signedIn })

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
  }, [signedIn, privateVersion])

  useEffect(() => {
    if (!signedIn) return
    getDoc(doc(db, 'settings', 'global')).then(snap => {
      const data = snap.data()
      setDeadlineHours((data?.['groupSessionCancellationDeadlineHours'] as number | undefined) ?? DEFAULT_CANCELLATION_DEADLINE_HOURS)
      setWhatsappPhone((data?.['clientWhatsappPhone'] as string | undefined) ?? '')
    }).catch(() => {})
  }, [signedIn])

  const sessions = useMemo((): HomeSession[] => {
    const now = Date.now()
    const fromPublic = publicSessions.flatMap((gs): HomeSession[] => {
      if (!gs.startAt?.toDate || !gs.endAt?.toDate) return []
      const active = gs.enrollments.filter(e => e.status !== 'cancelled')
      const mine = profile ? active.find(e => e.clientId === profile.clientId) : undefined
      return [{
        id: gs.id, title: gs.title, startAt: gs.startAt.toDate(), endAt: gs.endAt.toDate(),
        coachNames: gs.coachNames ?? [], locationId: gs.locationId,
        spotsLeft: gs.maxParticipants - active.length,
        myStatus: mine?.status, viaClassPass: !!mine?.classPassBookingId,
      }]
    })
    const fromPrivate = privateSessions
      .filter(s => s.status === 'planned' && new Date(s.startAt).getTime() >= now)
      .map((s): HomeSession => ({
        id: s.id, title: s.title, startAt: new Date(s.startAt), endAt: new Date(s.endAt),
        coachNames: s.coachNames ?? [], locationId: s.locationId,
        spotsLeft: s.maxParticipants - s.confirmedCount,
        myStatus: s.myEnrollment?.status,
      }))
    return [...fromPublic, ...fromPrivate].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  }, [publicSessions, privateSessions, profile])

  const myUpcoming = sessions.filter(s => s.myStatus)
  const next = myUpcoming[0]
  const openSlots = sessions.filter(s => !s.myStatus && s.spotsLeft > 0).slice(0, 3)
  const placeOf = (s: HomeSession) => {
    const loc = locations.find(l => l.id === s.locationId)
    return loc?.address || loc?.name || ''
  }

  const loading = authLoading || profileLoading || publicLoading
  const initial = profile?.firstName.trim().charAt(0).toUpperCase() ?? ''
  const whatsappUrl = whatsappLink(whatsappPhone)

  return (
    <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Bis Repetita</span>
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

      <h1 style={{ margin: '40px 0 24px', fontSize: 36, fontWeight: 400, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
        {authLoading || profileLoading ? ' ' : profile ? `Bonjour ${profile.firstName}` : 'Bonjour'}
      </h1>

      {!authLoading && !signedIn ? (
        <Link href={`/login?redirect=${encodeURIComponent('/home')}` as never} style={primaryButton}>
          Se connecter
        </Link>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ ...card, height: 170, background: C.soft, opacity: 0.6 }} />
          ) : next ? (
            <NextSessionCard
              session={next}
              place={placeOf(next)}
              deadlineHours={deadlineHours}
              otherCount={myUpcoming.length - 1}
              onCancelled={() => setPrivateVersion(v => v + 1)}
              onPay={() => router.push(`/group-sessions/${next.id}` as never)}
            />
          ) : (
            <OpenSlotsCard slots={openSlots} />
          )}

          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="press-effect" style={{ ...card, ...linkCard }}>
              <span style={{ ...iconCircle, background: C.soft }}><MessageSquare size={18} strokeWidth={1.75} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Envie d&apos;une séance privée ?</span>
                <span style={{ display: 'block', fontSize: 13, color: C.muted, marginTop: 2 }}>Écris-nous sur WhatsApp</span>
              </span>
              <span style={{ ...arrowCircle, background: C.bg }}><ArrowRight size={14} /></span>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function NextSessionCard({ session, place, deadlineHours, otherCount, onCancelled, onPay }: {
  session: HomeSession
  place: string
  deadlineHours: number
  otherCount: number
  onCancelled: () => void
  onPay: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = session.myStatus === 'pending_payment'
  const tooLate = Date.now() > session.startAt.getTime() - deadlineHours * 3600_000
  const coaches = session.coachNames.map(n => n.trim().split(' ')[0]).filter(Boolean).join(' & ')

  async function cancel() {
    setBusy(true)
    setError('')
    try {
      await cancelGroupSessionEnrollment(session.id)
      setConfirming(false)
      onCancelled()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'annulation.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={card}>
      <Link href={`/group-sessions/${session.id}` as never} style={{ display: 'flex', gap: 14, color: 'inherit', textDecoration: 'none' }}>
        <DateBox date={session.startAt} dark />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.25 }}>{session.title}</p>
          <p style={{ margin: '3px 0 0', fontSize: 14, color: C.muted }}>
            {format(session.startAt, 'HH:mm')} – {format(session.endAt, 'HH:mm')}{coaches && ` · avec ${coaches}`}
          </p>
          {place && <p style={{ margin: '2px 0 0', fontSize: 14, color: C.muted }}>{place}</p>}
          {pending && <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: '#B26A00' }}>Paiement en attente</p>}
        </div>
      </Link>

      {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#C0392B' }}>{error}</p>}

      {confirming ? (
        <div style={{ marginTop: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 500 }}>Annuler ta réservation ?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={cancel} disabled={busy} style={{ ...primaryButton, flex: 1 }}>
              {busy ? 'Annulation…' : 'Oui, annuler'}
            </button>
            <button onClick={() => setConfirming(false)} disabled={busy} style={secondaryButton}>Garder</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {pending ? (
              <button onClick={onPay} style={{ ...primaryButton, flex: 1 }}>Payer</button>
            ) : (
              <a href={`/api/group-sessions/calendar/${session.id}`} style={{ ...primaryButton, flex: 1 }}>Ajouter au calendrier</a>
            )}
            <button
              onClick={() => setConfirming(true)}
              disabled={tooLate || session.viaClassPass}
              style={{ ...secondaryButton, opacity: tooLate || session.viaClassPass ? 0.4 : 1, cursor: tooLate || session.viaClassPass ? 'default' : 'pointer' }}
            >
              Annuler
            </button>
          </div>
          {session.viaClassPass ? (
            <p style={hint}>Réservée via ClassPass : l&apos;annulation se fait dans l&apos;app ClassPass.</p>
          ) : tooLate && (
            <p style={hint}>Annulation impossible à moins de {deadlineHours} h du début. Contacte ton coach.</p>
          )}
        </>
      )}

      {otherCount > 0 && (
        <Link href="/my-enrollments" style={footerLink}>
          {otherCount === 1 ? 'Voir mon autre réservation' : `Voir mes ${otherCount} autres réservations`}
        </Link>
      )}
    </div>
  )
}

function OpenSlotsCard({ slots }: { slots: HomeSession[] }) {
  return (
    <div style={{ ...card, paddingBottom: 6 }}>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Aucune séance réservée</p>
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

function DateBox({ date, dark }: { date: Date; dark?: boolean }) {
  const size = dark ? { width: 64, height: 68, radius: 14, day: 26 } : { width: 46, height: 50, radius: 10, day: 19 }
  return (
    <div style={{
      width: size.width, height: size.height, borderRadius: size.radius, flexShrink: 0,
      background: dark ? C.ink : C.soft, color: dark ? '#fff' : C.ink,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: dark ? 11 : 9, fontWeight: 500, textTransform: 'uppercase', opacity: dark ? 0.85 : 0.7, lineHeight: 1.2 }}>
        {format(date, 'EEE', { locale: fr })}
      </span>
      <span style={{ fontSize: size.day, fontWeight: 600, lineHeight: 1.05 }}>{format(date, 'd')}</span>
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

const card: React.CSSProperties = { background: C.card, borderRadius: 22, padding: 18 }
const linkCard: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, padding: 16, color: C.ink, textDecoration: 'none' }
const iconCircle: React.CSSProperties = { width: 44, height: 44, borderRadius: 9999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const arrowCircle: React.CSSProperties = { width: 32, height: 32, borderRadius: 9999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const primaryButton: React.CSSProperties = {
  height: 46, borderRadius: 9999, border: 'none', background: C.ink, color: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600,
  textDecoration: 'none', fontFamily: 'inherit',
}
const secondaryButton: React.CSSProperties = {
  height: 46, borderRadius: 9999, border: '1px solid #CFCFCC', background: 'transparent', color: C.ink, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', fontSize: 14, fontWeight: 500,
  textDecoration: 'none', flexShrink: 0, fontFamily: 'inherit',
}
const footerLink: React.CSSProperties = {
  display: 'block', textAlign: 'center', padding: '12px 0 4px', marginTop: 4, fontSize: 14, color: C.ink, textDecoration: 'none',
}
const hint: React.CSSProperties = { margin: '8px 0 0', fontSize: 12, color: C.muted }
