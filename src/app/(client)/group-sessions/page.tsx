'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore'
import {
  format, isToday, isTomorrow, isSameDay,
  startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isWithinInterval,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, SlidersHorizontal, Check } from 'lucide-react'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { C, card, iconCircle, secondaryButton, pageTitle, Pill, coachFirstNames } from '@/components/client/ClientUI'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useCollection } from '@/lib/hooks/useCollection'
import { fetchMyPrivateGroupSessions } from '@/lib/services/group-session.service'
import { GROUP_SESSION_LEVEL_LABELS, type GroupSession, type GroupSessionLevel, type Service } from '@/types'

type SortMode = 'date' | 'price_asc' | 'price_desc'

// Vue normalisée commune aux deux sources de données : lecture Firestore directe (client connecté,
// voit `enrollments` en direct) ou route publique redacted (visiteur non connecté — jamais accès
// au détail des inscriptions/paiements des autres clients, juste un compteur de places prises).
interface GroupSessionListItem {
  id: string
  title: string
  description?: string
  coachNames?: string[]
  serviceId?: string
  imageUrl?: string
  startAt: Date
  maxParticipants: number
  price: number
  level?: GroupSessionLevel
  confirmedCount: number
  isEnrolled: boolean
  // Séance d'un groupe privé dont le client est membre (via /api/private-groups/my-sessions)
  privateGroupName?: string
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Aujourd'hui"
  if (isTomorrow(date)) return 'Demain'
  return format(date, 'EEEE d MMMM', { locale: fr })
}

export default function ClientGroupSessionsPage() {
  const { firebaseUser, loading: authLoading } = useAuth()
  const { profile } = useClientProfile()
  const [publicItems, setItems] = useState<GroupSessionListItem[]>([])
  const [privateItems, setPrivateItems] = useState<GroupSessionListItem[]>([])
  const items = useMemo(() => [...publicItems, ...privateItems], [publicItems, privateItems])
  const [loading, setLoading] = useState(true)
  const { data: services } = useCollection<Service>('services', [])
  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services])

  const [sortMode, setSortMode] = useState<SortMode>('date')
  const [filterServiceId, setFilterServiceId] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))

  useEffect(() => {
    if (authLoading) return

    // Client connecté : lecture Firestore directe temps réel (comportement existant, inchangé).
    if (firebaseUser) {
      const q = query(
        collection(db, 'groupSessions'),
        where('isPublic', '==', true),
        where('status', '==', 'planned'),
        where('startAt', '>=', Timestamp.now()),
        orderBy('startAt', 'asc'),
      )
      return onSnapshot(q, snap => {
        const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupSession))
        setItems(raw.map(gs => ({
          id: gs.id, title: gs.title, description: gs.description, coachNames: gs.coachNames,
          serviceId: gs.serviceId, startAt: gs.startAt.toDate(), maxParticipants: gs.maxParticipants,
          price: gs.price, level: gs.level,
          confirmedCount: gs.enrollments.filter(e => e.status !== 'cancelled').length,
          isEnrolled: !!profile && gs.enrollments.some(e => e.clientId === profile.clientId && e.status !== 'cancelled'),
        })))
        setLoading(false)
      }, () => setLoading(false))
    }

    // Visiteur non connecté : route publique redacted (pas de lecture Firestore directe possible,
    // les règles exigent isClient()/isCoach()).
    let cancelled = false
    fetch('/api/group-sessions/public-list')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(({ items: apiItems }: { items: Array<Omit<GroupSessionListItem, 'startAt' | 'isEnrolled'> & { startAt: string }> }) => {
        if (cancelled) return
        setItems((apiItems ?? []).map(it => ({ ...it, startAt: new Date(it.startAt), isEnrolled: false })))
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
      const now = Date.now()
      setPrivateItems(list
        .filter(s => s.status === 'planned' && new Date(s.startAt).getTime() >= now)
        .map(s => ({
          id: s.id, title: s.title, description: s.description, coachNames: s.coachNames,
          serviceId: s.serviceId, startAt: new Date(s.startAt), maxParticipants: s.maxParticipants,
          price: s.price, level: s.level as GroupSessionLevel | undefined, confirmedCount: s.confirmedCount,
          isEnrolled: !!s.myStatus, privateGroupName: s.privateGroupName,
        })))
    })
    return () => { cancelled = true }
  }, [firebaseUser, authLoading])

  // Services proposant au moins une séance à venir — seuls ceux-là apparaissent comme filtres
  const availableServiceIds = useMemo(() => new Set(items.map(gs => gs.serviceId).filter(Boolean)), [items])
  const filterableServices = useMemo(
    () => services.filter(s => availableServiceIds.has(s.id)),
    [services, availableServiceIds]
  )

  const weekStart = weekAnchor
  const weekEnd = endOfWeek(weekAnchor, { weekStartsOn: 1 })

  const filtered = useMemo(() => {
    let result = items
    if (filterServiceId) result = result.filter(gs => gs.serviceId === filterServiceId)
    if (onlyAvailable) result = result.filter(gs => gs.confirmedCount < gs.maxParticipants)
    result = result.filter(gs => isWithinInterval(gs.startAt, { start: weekStart, end: weekEnd }))
    return result
  }, [items, filterServiceId, onlyAvailable, weekStart, weekEnd])

  // Regroupement par jour — le tri choisi ne s'applique qu'à l'intérieur de chaque journée
  const groups = useMemo(() => {
    const byDay = new Map<string, GroupSessionListItem[]>()
    filtered.forEach(gs => {
      const key = format(gs.startAt, 'yyyy-MM-dd')
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(gs)
    })
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dayItems]) => ({
        date: dayItems[0]!.startAt,
        items: [...dayItems].sort((a, b) => {
          if (sortMode === 'price_asc') return a.price - b.price
          if (sortMode === 'price_desc') return b.price - a.price
          return a.startAt.getTime() - b.startAt.getTime()
        }),
      }))
  }, [filtered, sortMode])

  const activeFilterCount = (sortMode !== 'date' ? 1 : 0) + (onlyAvailable ? 1 : 0)
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }))
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const daysWithSessions = new Set(groups.map(g => format(g.date, 'yyyy-MM-dd')))

  function scrollToDay(day: Date) {
    document.getElementById(`jour-${format(day, 'yyyy-MM-dd')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
        <BrandLogo />
        <button
          onClick={() => setShowFilters(v => !v)}
          aria-label="Filtres"
          className="press-effect"
          style={{
            position: 'relative', width: 38, height: 38, borderRadius: 9999, border: 'none', cursor: 'pointer',
            background: showFilters ? C.ink : '#E0E0DF', color: showFilters ? '#fff' : C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <SlidersHorizontal size={16} strokeWidth={1.75} />
          {activeFilterCount > 0 && !showFilters && (
            <span style={{
              position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: 9999, background: C.ink, color: '#fff',
              fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${C.bg}`,
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </header>

      <h1 style={{ ...pageTitle, margin: '40px 0 20px' }}>Planning</h1>

      {/* Semaine : précédente / suivante + jours de la semaine */}
      <div style={{ ...card, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setWeekAnchor(w => subWeeks(w, 1))} aria-label="Semaine précédente" className="press-effect" style={roundButton}>
            <ChevronLeft size={16} />
          </button>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {isCurrentWeek ? 'Cette semaine' : `${format(weekStart, 'd MMM', { locale: fr })} – ${format(weekEnd, 'd MMM', { locale: fr })}`}
          </p>
          <button onClick={() => setWeekAnchor(w => addWeeks(w, 1))} aria-label="Semaine suivante" className="press-effect" style={roundButton}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 12 }}>
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
        </div>
      </div>

      {/* Filtre service — toujours visible */}
      {filterableServices.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '12px -20px 0', padding: '0 20px' }}>
          <Chip active={!filterServiceId} onClick={() => setFilterServiceId('')}>Tous</Chip>
          {filterableServices.map(s => (
            <Chip key={s.id} active={filterServiceId === s.id} onClick={() => setFilterServiceId(s.id)}>{s.name}</Chip>
          ))}
        </div>
      )}

      {/* Panneau filtres */}
      {showFilters && (
        <div style={{ ...card, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: C.muted }}>Trier par</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['date', 'Heure'], ['price_asc', 'Prix ↑'], ['price_desc', 'Prix ↓']] as [SortMode, string][]).map(([v, label]) => (
                <Chip key={v} active={sortMode === v} onClick={() => setSortMode(v)} grow>{label}</Chip>
              ))}
            </div>
          </div>
          <button
            onClick={() => setOnlyAvailable(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}
          >
            <span style={{ fontSize: 14 }}>Uniquement les places disponibles</span>
            <span style={{
              width: 44, height: 26, borderRadius: 9999, padding: 3, flexShrink: 0, transition: 'background 160ms ease',
              background: onlyAvailable ? C.ink : C.border, display: 'flex', justifyContent: onlyAvailable ? 'flex-end' : 'flex-start',
            }}>
              <span style={{ width: 20, height: 20, borderRadius: 9999, background: '#fff' }} />
            </span>
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ ...card, height: 96, background: C.soft, opacity: 0.6 }} />)}
        </div>
      ) : groups.length === 0 ? (
        <div style={{ ...card, marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6, padding: '32px 24px' }}>
          <span style={{ ...iconCircle, background: C.soft, marginBottom: 6 }}><CalendarDays size={18} strokeWidth={1.75} /></span>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Aucune séance</p>
          <p style={{ margin: 0, fontSize: 14, color: C.muted }}>
            {items.length > 0 && (filterServiceId || onlyAvailable)
              ? 'Aucune séance ne correspond à ces filtres cette semaine.'
              : 'Pas de cours cette semaine, regarde la semaine suivante.'}
          </p>
          <button onClick={() => setWeekAnchor(w => addWeeks(w, 1))} style={{ ...secondaryButton, marginTop: 12, height: 42 }}>
            Semaine suivante
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 24 }}>
          {groups.map(group => (
            <section key={group.date.toISOString()} id={`jour-${format(group.date, 'yyyy-MM-dd')}`} style={{ scrollMarginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '0 4px 10px' }}>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 600, textTransform: 'capitalize' }}>{dayLabel(group.date)}</p>
                <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
                  {group.items.length} séance{group.items.length > 1 ? 's' : ''}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.items.map(gs => (
                  <SessionCard
                    key={gs.id}
                    session={gs}
                    imageUrl={gs.imageUrl ?? (gs.serviceId ? serviceMap.get(gs.serviceId)?.imageUrl : undefined)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({ session: gs, imageUrl }: { session: GroupSessionListItem; imageUrl?: string }) {
  const spotsLeft = Math.max(0, gs.maxParticipants - gs.confirmedCount)
  const isFull = spotsLeft === 0
  const coaches = coachFirstNames(gs.coachNames)
  return (
    <Link
      href={`/group-sessions/${gs.id}` as never}
      className="press-effect"
      style={{
        ...card, padding: 0, overflow: 'hidden', display: 'block', color: C.ink, textDecoration: 'none',
        outline: gs.isEnrolled ? `1.5px solid ${C.ink}` : undefined, outlineOffset: -1.5,
      }}
    >
      {imageUrl && (
        <div style={{ height: 112, background: `url(${imageUrl}) center/cover no-repeat`, opacity: isFull && !gs.isEnrolled ? 0.6 : 1 }} />
      )}
      <div style={{ display: 'flex', gap: 14, padding: 16, alignItems: 'flex-start' }}>
        <div style={{
          width: 58, height: 58, borderRadius: 14, flexShrink: 0,
          background: gs.isEnrolled ? C.ink : C.soft, color: gs.isEnrolled ? '#fff' : C.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        }}>
          {format(gs.startAt, 'HH:mm')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{gs.title}</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, flexShrink: 0, color: gs.price === 0 ? C.green : C.ink }}>
              {gs.price === 0 ? 'Gratuit' : `${formatPrice(gs.price)} CHF`}
            </p>
          </div>
          {coaches && <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>avec {coaches}</p>}
          {gs.description && (
            <p style={{
              margin: '6px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {gs.description}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {gs.isEnrolled ? (
              <Pill tone="green"><Check size={12} strokeWidth={2.5} />Inscrit</Pill>
            ) : isFull ? (
              <Pill tone="red">Complet</Pill>
            ) : (
              <Pill tone={spotsLeft <= 2 ? 'amber' : 'neutral'}>{spotsLeft} place{spotsLeft > 1 ? 's' : ''}</Pill>
            )}
            {gs.privateGroupName && <Pill tone="neutral">{gs.privateGroupName}</Pill>}
            {gs.level && <Pill tone="neutral">{GROUP_SESSION_LEVEL_LABELS[gs.level]}</Pill>}
          </div>
        </div>
      </div>
    </Link>
  )
}

function Chip({ active, onClick, grow, children }: { active: boolean; onClick: () => void; grow?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 36, padding: '0 16px', borderRadius: 9999, border: 'none', cursor: 'pointer', flexShrink: 0,
        flex: grow ? 1 : undefined, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
        background: active ? C.ink : C.soft, color: active ? '#fff' : C.ink,
      }}
    >
      {children}
    </button>
  )
}

/** « 25 » plutôt que « 25.00 », mais « 22.50 » gardé tel quel. */
function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2)
}

const roundButton: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 9999, border: 'none', background: C.soft, color: C.ink, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
