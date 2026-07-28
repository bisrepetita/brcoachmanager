'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore'
import {
  format, isToday, isTomorrow, isSameDay,
  startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { Users2, CalendarDays, User, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { useCollection } from '@/lib/hooks/useCollection'
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
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Aujourd'hui"
  if (isTomorrow(date)) return 'Demain'
  return format(date, 'EEEE d MMMM', { locale: fr })
}

export default function ClientGroupSessionsPage() {
  const router = useRouter()
  const { firebaseUser, loading: authLoading } = useAuth()
  const { profile } = useClientProfile()
  const [items, setItems] = useState<GroupSessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const { data: services } = useCollection<Service>('services', [])
  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services])

  const [sortMode, setSortMode] = useState<SortMode>('date')
  const [filterServiceId, setFilterServiceId] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  return (
    <>
      <TopBar
        title="Planning"
        right={
          <button
            onClick={() => router.push('/profile' as never)}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E1DA', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <User size={16} color="#7A7570" />
          </button>
        }
      />
      <TopBarSpacer />

      {/* Navigation semaine + filtres */}
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 10, padding: '8px 10px' }}>
          <button onClick={() => setWeekAnchor(w => subWeeks(w, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={18} color="#7A7570" />
          </button>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A18', margin: 0, textTransform: 'capitalize' }}>
            {isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }))
              ? 'Cette semaine'
              : `${format(weekStart, 'd MMM', { locale: fr })} – ${format(weekEnd, 'd MMM', { locale: fr })}`}
          </p>
          <button onClick={() => setWeekAnchor(w => addWeeks(w, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronRight size={18} color="#7A7570" />
          </button>
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          style={{
            position: 'relative', width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            border: `1px solid ${showFilters || activeFilterCount > 0 ? '#1A1A18' : '#E5E1DA'}`,
            background: showFilters ? '#1A1A18' : '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <SlidersHorizontal size={15} color={showFilters ? '#fff' : '#1A1A18'} />
          {activeFilterCount > 0 && !showFilters && (
            <span style={{ position: 'absolute', top: -3, right: -3, width: 15, height: 15, borderRadius: 8, background: '#C0392B', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filtre service — toujours visible */}
      {filterableServices.length > 0 && (
        <div style={{ padding: '10px 16px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setFilterServiceId('')}
            style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: !filterServiceId ? '#1A1A18' : '#F0EDE8', color: !filterServiceId ? '#fff' : '#1A1A18' }}>
            Tous
          </button>
          {filterableServices.map(s => (
            <button key={s.id} onClick={() => setFilterServiceId(s.id)}
              style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: filterServiceId === s.id ? '#1A1A18' : '#F0EDE8', color: filterServiceId === s.id ? '#fff' : '#1A1A18' }}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Panneau filtres */}
      {showFilters && (
        <div style={{ margin: '10px 16px 0', background: '#fff', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Trier par</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['date', 'Date'], ['price_asc', 'Prix ↑'], ['price_desc', 'Prix ↓']] as [SortMode, string][]).map(([v, label]) => (
                <button key={v} onClick={() => setSortMode(v)}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: sortMode === v ? '#1A1A18' : '#F0EDE8', color: sortMode === v ? '#fff' : '#1A1A18' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => setOnlyAvailable(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: onlyAvailable ? '#1A1A18' : 'transparent', border: `1.5px solid ${onlyAvailable ? '#1A1A18' : '#C8C4BC'}`,
            }}>
              {onlyAvailable && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: '#1A1A18' }}>Uniquement les places disponibles</span>
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
        </div>
      ) : groups.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', gap: 12 }}>
          <CalendarDays size={44} color="#A09890" strokeWidth={1.5} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Aucune séance à venir</p>
          <p style={{ fontSize: 14, color: '#7A7570', margin: 0, textAlign: 'center' }}>
            {items.length > 0
              ? 'Aucune séance ne correspond à ces filtres cette semaine.'
              : 'Aucun cours cette semaine — essaie la semaine suivante.'}
          </p>
        </div>
      ) : (
        <div style={{ padding: '14px 16px 80px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(group => (
            <div key={group.date.toISOString()}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, padding: '0 2px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1A18', margin: 0, textTransform: 'capitalize' }}>
                  {dayLabel(group.date)}
                </p>
                <div style={{ flex: 1, height: 1, background: '#E5E1DA' }} />
                <p style={{ fontSize: 11, color: '#A09890', margin: 0 }}>
                  {group.items.length} séance{group.items.length > 1 ? 's' : ''}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.items.map(gs => {
                  const confirmedCount = gs.confirmedCount
                  const isFull = confirmedCount >= gs.maxParticipants
                  const spotsLeft = gs.maxParticipants - confirmedCount
                  const isAlmostFull = !isFull && spotsLeft <= 2
                  const isEnrolled = gs.isEnrolled
                  const sessionDate = gs.startAt
                  const fillRatio = gs.maxParticipants > 0 ? Math.min(1, confirmedCount / gs.maxParticipants) : 0
                  const imageUrl = gs.imageUrl ?? (gs.serviceId ? serviceMap.get(gs.serviceId)?.imageUrl : undefined)
                  const isExpanded = expandedIds.has(gs.id)
                  const isLongDescription = (gs.description?.length ?? 0) > 60

                  const theme = imageUrl ? {
                    cardBackground: `linear-gradient(180deg, rgba(10,10,10,0.20) 0%, rgba(10,10,10,0.82) 100%), url(${imageUrl}) center/100% auto no-repeat`,
                    border: isEnrolled ? '1px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.12)',
                    chipBg: 'rgba(255,255,255,0.16)',
                    chipDay: '#FFFFFF',
                    chipMonth: 'rgba(255,255,255,0.75)',
                    title: '#FFFFFF',
                    secondary: 'rgba(255,255,255,0.82)',
                    price: '#FFFFFF',
                    barTrack: 'rgba(255,255,255,0.25)',
                    badgeBg: '#FFFFFF',
                    badgeText: '#1A1A18',
                    neutralFill: '#FFFFFF',
                    almostFill: '#FFC978',
                    fullFill: '#FF8A7A',
                  } : {
                    cardBackground: '#fff',
                    border: isEnrolled ? '1px solid #1A1A18' : '1px solid #EEEAE3',
                    chipBg: '#F5F3F0',
                    chipDay: '#1A1A18',
                    chipMonth: '#A09890',
                    title: '#1A1A18',
                    secondary: '#7A7570',
                    price: '#1A1A18',
                    barTrack: '#F0EDE8',
                    badgeBg: '#1A1A18',
                    badgeText: '#FFFFFF',
                    neutralFill: '#1A1A18',
                    almostFill: '#B8792E',
                    fullFill: '#C0392B',
                  }
                  const fillColor = isFull ? theme.fullFill : isAlmostFull ? theme.almostFill : theme.neutralFill

                  return (
                    <div
                      key={gs.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/group-sessions/${gs.id}` as never)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          router.push(`/group-sessions/${gs.id}` as never)
                        }
                      }}
                      className="press-effect"
                      style={{
                        background: theme.cardBackground, borderRadius: 14, padding: 14,
                        border: theme.border,
                        boxShadow: imageUrl ? '0 4px 14px rgba(0,0,0,0.18)' : '0 1px 2px rgba(26,26,24,0.04)',
                        minHeight: imageUrl ? 118 : undefined,
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                        display: 'flex', alignItems: 'stretch', gap: 12,
                      }}
                    >
                      {/* Heure */}
                      <div style={{
                        flexShrink: 0, width: 52, borderRadius: 10, background: theme.chipBg,
                        backdropFilter: imageUrl ? 'blur(4px)' : undefined,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 0',
                      }}>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.chipDay, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                          {sessionDate ? format(sessionDate, 'HH:mm') : '—'}
                        </p>
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: theme.title, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                            {gs.title}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {gs.level && (
                              <span style={{
                                fontSize: 10, fontWeight: 600, color: theme.secondary, background: theme.chipBg,
                                padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap',
                              }}>
                                {GROUP_SESSION_LEVEL_LABELS[gs.level]}
                              </span>
                            )}
                            {isEnrolled && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: theme.badgeText, background: theme.badgeBg,
                                padding: '2px 7px', borderRadius: 20, letterSpacing: 0.2,
                              }}>
                                INSCRIT
                              </span>
                            )}
                          </div>
                        </div>

                        {gs.coachNames && gs.coachNames.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: theme.secondary, overflow: 'hidden' }}>
                            <User size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {gs.coachNames.join(' & ')}
                            </span>
                          </div>
                        )}

                        {gs.description && (
                          <div style={{ marginTop: 1 }}>
                            <p style={{
                              fontSize: 12.5, color: theme.secondary, margin: 0, lineHeight: 1.4,
                              ...(isExpanded
                                ? { whiteSpace: 'pre-wrap' as const }
                                : {
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                                    overflow: 'hidden',
                                  }),
                            }}>
                              {gs.description}
                            </p>
                            {isLongDescription && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleExpanded(gs.id) }}
                                onKeyDown={(e) => e.stopPropagation()}
                                style={{
                                  background: 'none', border: 'none', padding: 0, marginTop: 2,
                                  fontSize: 11, fontWeight: 600, color: theme.secondary, cursor: 'pointer',
                                  textDecoration: 'underline', textUnderlineOffset: 2,
                                }}
                              >
                                {isExpanded ? 'Réduire' : 'Lire la suite'}
                              </button>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 2 }}>
                          {isFull ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: theme.fullFill }}>Complet</span>
                          ) : isAlmostFull ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: theme.almostFill }}>
                              {spotsLeft} place{spotsLeft > 1 ? 's' : ''}
                            </span>
                          ) : null}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Users2 size={12} color={fillColor} />
                            <span style={{ fontSize: 12, color: fillColor, fontVariantNumeric: 'tabular-nums' }}>
                              {confirmedCount}/{gs.maxParticipants}
                            </span>
                          </div>
                        </div>

                        {/* Capacity bar */}
                        <div style={{ height: 3, borderRadius: 2, background: theme.barTrack, overflow: 'hidden', marginTop: 1 }}>
                          <div style={{ height: '100%', width: `${fillRatio * 100}%`, background: fillColor, borderRadius: 2, transition: 'width 0.2s' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <ChevronRight size={16} color={theme.secondary} strokeWidth={2} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
