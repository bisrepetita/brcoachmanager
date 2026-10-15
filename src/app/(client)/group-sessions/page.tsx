'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore'
import {
  format, isToday, isSameDay, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isWithinInterval,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useClientSettings } from '@/lib/hooks/useClientSettings'
import { useCollection } from '@/lib/hooks/useCollection'
import { fetchMyPrivateGroupSessions } from '@/lib/services/group-session.service'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { C, card, secondaryButton, pageTitle, DateBox, coachFirstNames } from '@/components/client/ClientUI'
import type { GroupSession, GroupSessionEnrollmentStatus, Service } from '@/types'

// Vue normalisée commune aux deux sources de données : lecture Firestore directe (client connecté,
// voit `enrollments` en direct) ou route publique redacted (visiteur non connecté — jamais accès
// au détail des inscriptions/paiements des autres clients, juste un compteur de places prises).
interface GroupSessionListItem {
  id: string
  title: string
  coachNames?: string[]
  serviceId?: string
  startAt: Date
  endAt?: Date
  maxParticipants: number
  confirmedCount: number
  myStatus?: GroupSessionEnrollmentStatus
  // Séance d'un groupe privé dont le client est membre (via /api/private-groups/my-sessions)
  privateGroupName?: string
}

const SHOW_DAYS_KEY = 'br_planning_show_days'

export default function ClientGroupSessionsPage() {
  const { firebaseUser, loading: authLoading } = useAuth()
  const { profile } = useClientProfile()
  const { deadlineHours } = useClientSettings()
  const [publicItems, setItems] = useState<GroupSessionListItem[]>([])
  const [privateItems, setPrivateItems] = useState<GroupSessionListItem[]>([])
  const items = useMemo(() => [...publicItems, ...privateItems], [publicItems, privateItems])
  const [loading, setLoading] = useState(true)
  const { data: services } = useCollection<Service>('services', [])

  const [filterServiceId, setFilterServiceId] = useState('')
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  // Pastilles des jours repliables (place limitée sur téléphone) — repliées par défaut, choix
  // mémorisé dans le navigateur.
  const [showDays, setShowDays] = useState(false)
  useEffect(() => {
    try { setShowDays(localStorage.getItem(SHOW_DAYS_KEY) === '1') } catch { /* stockage indisponible */ }
  }, [])
  function toggleDays() {
    setShowDays(v => {
      try { localStorage.setItem(SHOW_DAYS_KEY, v ? '0' : '1') } catch { /* stockage indisponible */ }
      return !v
    })
  }

  useEffect(() => {
    if (authLoading) return

    // Client connecté : lecture Firestore directe temps réel, depuis le début de la semaine en
    // cours pour afficher aussi les séances déjà passées (« Terminée »).
    if (firebaseUser) {
      const q = query(
        collection(db, 'groupSessions'),
        where('isPublic', '==', true),
        where('status', 'in', ['planned', 'done']),
        where('startAt', '>=', Timestamp.fromDate(startOfWeek(new Date(), { weekStartsOn: 1 }))),
        orderBy('startAt', 'asc'),
      )
      return onSnapshot(q, snap => {
        const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupSession))
        setItems(raw.map(gs => ({
          id: gs.id, title: gs.title, coachNames: gs.coachNames, serviceId: gs.serviceId,
          startAt: gs.startAt.toDate(), endAt: gs.endAt?.toDate?.(), maxParticipants: gs.maxParticipants,
          confirmedCount: gs.enrollments.filter(e => e.status !== 'cancelled').length,
          myStatus: profile ? gs.enrollments.find(e => e.clientId === profile.clientId && e.status !== 'cancelled')?.status : undefined,
        })))
        setLoading(false)
      }, () => setLoading(false))
    }

    // Visiteur non connecté : route publique redacted (pas de lecture Firestore directe possible,
    // les règles exigent isClient()/isCoach()).
    let cancelled = false
    fetch('/api/group-sessions/public-list')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(({ items: apiItems }: { items: Array<Omit<GroupSessionListItem, 'startAt' | 'endAt'> & { startAt: string; endAt?: string }> }) => {
        if (cancelled) return
        setItems((apiItems ?? []).map(it => ({
          ...it, startAt: new Date(it.startAt), endAt: it.endAt ? new Date(it.endAt) : undefined, myStatus: undefined,
        })))
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [firebaseUser, authLoading, profile])

  // Séances des groupes privés du client (pas de lecture Firestore possible en liste, cf. règles) —
  // chargées une fois, sans temps réel.
  useEffect(() => {
    if (authLoading || !firebaseUser) { setPrivateItems([]); return }
    let cancelled = false
    fetchMyPrivateGroupSessions().then(list => {
      if (cancelled) return
      const from = startOfWeek(new Date(), { weekStartsOn: 1 }).getTime()
      setPrivateItems(list
        .filter(s => s.status !== 'cancelled' && new Date(s.startAt).getTime() >= from)
        .map(s => ({
          id: s.id, title: s.title, coachNames: s.coachNames, serviceId: s.serviceId,
          startAt: new Date(s.startAt), endAt: new Date(s.endAt), maxParticipants: s.maxParticipants,
          confirmedCount: s.confirmedCount, myStatus: s.myStatus, privateGroupName: s.privateGroupName,
        })))
    })
    return () => { cancelled = true }
  }, [firebaseUser, authLoading])

  // Services proposant au moins une séance — seuls ceux-là apparaissent comme filtres
  const filterableServices = useMemo(() => {
    const ids = new Set(items.map(gs => gs.serviceId).filter(Boolean))
    return services.filter(s => ids.has(s.id))
  }, [services, items])

  const weekStart = weekAnchor
  const weekEnd = endOfWeek(weekAnchor, { weekStartsOn: 1 })
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }))
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const weekItems = useMemo(() => items
    .filter(gs => !filterServiceId || gs.serviceId === filterServiceId)
    .filter(gs => isWithinInterval(gs.startAt, { start: weekStart, end: weekEnd }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
  [items, filterServiceId, weekStart, weekEnd])

  const daysWithSessions = new Set(weekItems.map(gs => format(gs.startAt, 'yyyy-MM-dd')))
  const initial = profile?.firstName.trim().charAt(0).toUpperCase() ?? ''

  function scrollToDay(day: Date) {
    document.getElementById(`jour-${format(day, 'yyyy-MM-dd')}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
        <BrandLogo />
        {firebaseUser && (
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

      <h1 style={{ ...pageTitle, margin: '40px 0 20px' }}>Planning</h1>

      {/* Semaine : précédente / suivante + jours de la semaine */}
      <div style={{ ...card, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setWeekAnchor(w => subWeeks(w, 1))} aria-label="Semaine précédente" className="press-effect" style={roundButton}>
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={toggleDays}
            aria-expanded={showDays}
            aria-label={showDays ? 'Masquer les jours' : 'Afficher les jours'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 9999,
              border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: C.ink,
              fontSize: 15, fontWeight: 600,
            }}
          >
            {isCurrentWeek ? 'Cette semaine' : `${format(weekStart, 'd MMM', { locale: fr })} – ${format(weekEnd, 'd MMM', { locale: fr })}`}
            {showDays ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
          </button>
          <button onClick={() => setWeekAnchor(w => addWeeks(w, 1))} aria-label="Semaine suivante" className="press-effect" style={roundButton}>
            <ChevronRight size={16} />
          </button>
        </div>
        {showDays && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 12 }}>
          {weekDays.map(day => {
            const key = format(day, 'yyyy-MM-dd')
            const hasSessions = daysWithSessions.has(key)
            const today = isToday(day)
            return (
              <button
                key={key}
                onClick={() => hasSessions && scrollToDay(day)}
                disabled={!hasSessions}
                style={{
                  height: 54, borderRadius: 14, border: 'none', fontFamily: 'inherit',
                  cursor: hasSessions ? 'pointer' : 'default',
                  background: today ? C.ink : hasSessions ? C.soft : 'transparent',
                  color: today ? '#fff' : hasSessions ? C.ink : '#AFAFAB',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', opacity: 0.8 }}>
                  {format(day, 'EEEEE', { locale: fr })}
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.1 }}>{format(day, 'd')}</span>
                <span style={{ width: 4, height: 4, borderRadius: 9999, background: hasSessions ? (today ? '#fff' : C.ink) : 'transparent' }} />
              </button>
            )
          })}
        </div>}
      </div>

      {/* Filtre service — seulement s'il y a un vrai choix */}
      {filterableServices.length > 1 && (
        <div className="no-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '12px -20px 0', padding: '0 20px' }}>
          <Chip active={!filterServiceId} onClick={() => setFilterServiceId('')}>Tous</Chip>
          {filterableServices.map(s => (
            <Chip key={s.id} active={filterServiceId === s.id} onClick={() => setFilterServiceId(s.id)}>{s.name}</Chip>
          ))}
        </div>
      )}

      {/* Séances de la semaine */}
      <div style={{ ...card, marginTop: 12, padding: '6px 18px' }}>
        {loading ? (
          <p style={{ margin: 0, padding: '28px 0', textAlign: 'center', fontSize: 14, color: C.muted }}>Chargement…</p>
        ) : weekItems.length === 0 ? (
          <div style={{ padding: '24px 0 18px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aucune séance cette semaine</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>Regarde la semaine suivante.</p>
            <button onClick={() => setWeekAnchor(w => addWeeks(w, 1))} style={{ ...secondaryButton, height: 40, margin: '14px auto 0' }}>
              Semaine suivante
            </button>
          </div>
        ) : weekItems.map((gs, idx) => {
          const firstOfDay = idx === 0 || !isSameDay(weekItems[idx - 1]!.startAt, gs.startAt)
          return (
            <SessionRow
              key={gs.id}
              session={gs}
              anchorId={firstOfDay ? `jour-${format(gs.startAt, 'yyyy-MM-dd')}` : undefined}
              divider={idx > 0}
            />
          )
        })}
      </div>

      {firebaseUser && (
        <p style={{ margin: '14px 4px 0', fontSize: 13, color: C.muted }}>
          Annulation sans frais jusqu&apos;à {deadlineHours} heures avant la séance.
        </p>
      )}
    </div>
  )
}

function SessionRow({ session: gs, anchorId, divider }: { session: GroupSessionListItem; anchorId?: string; divider: boolean }) {
  const now = Date.now()
  const isPast = (gs.endAt ?? gs.startAt).getTime() < now
  const spotsLeft = Math.max(0, gs.maxParticipants - gs.confirmedCount)
  const isFull = spotsLeft === 0
  const reserved = !!gs.myStatus
  const pending = gs.myStatus === 'pending_payment'
  const coaches = coachFirstNames(gs.coachNames)

  const note = isPast ? null
    : pending ? <span style={{ color: C.amber }}>Paiement en attente</span>
    : reserved ? 'Ta place est réservée'
    : !isFull && spotsLeft <= 3 ? <span style={{ color: C.amber }}>Plus que {spotsLeft} place{spotsLeft > 1 ? 's' : ''}</span>
    : gs.privateGroupName ?? null

  return (
    <Link
      id={anchorId}
      href={`/group-sessions/${gs.id}` as never}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', color: C.ink, textDecoration: 'none',
        borderTop: divider ? `1px solid ${C.line}` : undefined, scrollMarginTop: 24,
      }}
    >
      <div style={{ opacity: isPast ? 0.55 : 1 }}>
        <DateBox date={gs.startAt} dark={reserved && !isPast} />
      </div>
      <div style={{ flex: 1, minWidth: 0, color: isPast ? '#AFAFAB' : C.ink }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {format(gs.startAt, 'HH:mm')}{gs.endAt && ` – ${format(gs.endAt, 'HH:mm')}`}
        </p>
        <p style={{ margin: '1px 0 0', fontSize: 13, color: isPast ? '#AFAFAB' : C.muted, lineHeight: 1.35 }}>
          {gs.title}{coaches && ` · ${coaches}`}
        </p>
        {note && <p style={{ margin: '1px 0 0', fontSize: 12, fontWeight: 500, lineHeight: 1.35 }}>{note}</p>}
      </div>
      {isPast ? (
        <span style={{ fontSize: 13, color: '#AFAFAB', flexShrink: 0 }}>Terminée</span>
      ) : reserved ? (
        <span style={{ ...pill, background: pending ? C.amberBg : C.ink, color: pending ? C.amber : '#fff', border: 'none' }}>
          {pending ? 'À payer' : 'Réservé'}
        </span>
      ) : isFull ? (
        <span style={{ fontSize: 13, color: C.muted, flexShrink: 0 }}>Complet</span>
      ) : (
        <span style={pill}>Réserver</span>
      )}
    </Link>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 36, padding: '0 16px', borderRadius: 9999, border: 'none', cursor: 'pointer', flexShrink: 0,
        whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
        background: active ? C.ink : C.soft, color: active ? '#fff' : C.ink,
      }}
    >
      {children}
    </button>
  )
}

const pill: React.CSSProperties = {
  height: 38, padding: '0 16px', borderRadius: 9999, border: `1px solid ${C.border}`, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', fontSize: 14, fontWeight: 600, color: C.ink,
}

const roundButton: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 9999, border: 'none', background: C.soft, color: C.ink, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
