'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  format, isToday, isTomorrow, isSameDay, isWithinInterval,
  startOfWeek, endOfWeek, addWeeks, subWeeks,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { Users2, User, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { GROUP_SESSION_LEVEL_LABELS, type GroupSessionLevel } from '@/types'

type SortMode = 'date' | 'price_asc' | 'price_desc'

interface EmbedSession {
  id: string
  title: string
  description?: string
  coachNames?: string[]
  serviceId?: string
  serviceName?: string
  imageUrl?: string
  startAt: string
  maxParticipants: number
  price: number
  level?: GroupSessionLevel
  confirmedCount: number
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Aujourd'hui"
  if (isTomorrow(date)) return 'Demain'
  return format(date, 'EEEE d MMMM', { locale: fr })
}

// Widget destiné à être intégré en iframe sur un site externe (fond transparent — seules les
// cartes ont un fond propre, pour s'intégrer à n'importe quel design ; largeur fluide, en grille
// responsive, pour occuper toute la largeur disponible dans l'iframe). Ne réalise jamais d'action
// dans l'iframe elle-même (pas de connexion/réservation ici, trop à l'étroit) : chaque séance
// ouvre l'app dans un nouvel onglet, où le client se connecte et réserve normalement.
export default function EmbedPlanningPage() {
  return (
    <Suspense fallback={null}>
      <EmbedPlanningContent />
    </Suspense>
  )
}

function EmbedPlanningContent() {
  // Le fond de l'iframe est transparent (s'intègre à n'importe quel site) — mais le séparateur de
  // date et les textes d'état sont posés directement dessus, sans fond propre. Sur une page hôte au
  // fond sombre, leurs couleurs par défaut (pensées pour un fond clair) deviennent illisibles. Le
  // site intégrateur ajoute `?theme=dark` à l'URL de l'iframe pour les sections à fond sombre.
  const searchParams = useSearchParams()
  const isDark = searchParams.get('theme') === 'dark'

  const [items, setItems] = useState<EmbedSession[]>([])
  const [loading, setLoading] = useState(true)
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
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    fetch('/api/group-sessions/public-list')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(({ items }: { items?: EmbedSession[] }) => setItems(items ?? []))
      .finally(() => setLoading(false))
  }, [])

  // Informe la page parente de la hauteur réelle du contenu, pour qu'elle
  // puisse dimensionner l'iframe sans scrollbar interne ni contenu coupé.
  useEffect(() => {
    const sendHeight = () => {
      window.parent.postMessage(
        { type: 'br-embed-resize', height: document.documentElement.scrollHeight },
        '*'
      )
    }
    sendHeight()
    const resizeObserver = new ResizeObserver(sendHeight)
    resizeObserver.observe(document.body)
    window.addEventListener('resize', sendHeight)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', sendHeight)
    }
  }, [])

  const filterableServices = useMemo(() => {
    const seen = new Map<string, string>()
    items.forEach(it => { if (it.serviceId && it.serviceName && !seen.has(it.serviceId)) seen.set(it.serviceId, it.serviceName) })
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [items])

  const weekStart = weekAnchor
  const weekEnd = endOfWeek(weekAnchor, { weekStartsOn: 1 })

  const filtered = useMemo(() => {
    let result = items
    if (filterServiceId) result = result.filter(gs => gs.serviceId === filterServiceId)
    if (onlyAvailable) result = result.filter(gs => gs.confirmedCount < gs.maxParticipants)
    result = result.filter(gs => isWithinInterval(new Date(gs.startAt), { start: weekStart, end: weekEnd }))
    return result
  }, [items, filterServiceId, onlyAvailable, weekStart, weekEnd])

  const groups = useMemo(() => {
    const byDay = new Map<string, EmbedSession[]>()
    filtered.forEach(it => {
      const key = format(new Date(it.startAt), 'yyyy-MM-dd')
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(it)
    })
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, dayItems]) => ({
        date: new Date(dayItems[0]!.startAt),
        items: [...dayItems].sort((a, b) => {
          if (sortMode === 'price_asc') return a.price - b.price
          if (sortMode === 'price_desc') return b.price - a.price
          return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        }),
      }))
  }, [filtered, sortMode])

  const activeFilterCount = (sortMode !== 'date' ? 1 : 0) + (onlyAvailable ? 1 : 0)

  return (
    <div style={{ background: 'transparent', width: '100%', boxSizing: 'border-box', padding: '4px', fontFamily: 'var(--font-sans, sans-serif)' }}>
      {/* Navigation semaine + filtres */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #EEEAE3', borderRadius: 10, padding: '8px 10px' }}>
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
          aria-label="Filtres"
          onClick={() => setShowFilters(v => !v)}
          style={{
            position: 'relative', width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            border: `1px solid ${showFilters || activeFilterCount > 0 ? '#1A1A18' : '#EEEAE3'}`,
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

      {filterableServices.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
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

      {showFilters && (
        <div style={{ background: '#fff', border: '1px solid #EEEAE3', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 10 }}>
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
        <p style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#A09890', fontSize: 14, textAlign: 'center', padding: 24 }}>Chargement…</p>
      ) : groups.length === 0 ? (
        <p style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#A09890', fontSize: 14, textAlign: 'center', padding: 24 }}>
          {items.length > 0 ? 'Aucune séance ne correspond à ces filtres cette semaine.' : 'Aucune séance cette semaine.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {groups.map(group => (
            <div key={group.date.toISOString()}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, padding: '0 2px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#FFFFFF' : '#1A1A18', margin: 0, textTransform: 'capitalize' }}>
                  {dayLabel(group.date)}
                </p>
                <div style={{ flex: 1, height: 1, background: isDark ? 'rgba(255,255,255,0.25)' : '#E5E1DA' }} />
                <p style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.65)' : '#A09890', margin: 0 }}>
                  {group.items.length} séance{group.items.length > 1 ? 's' : ''}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {group.items.map(gs => {
                  const confirmedCount = gs.confirmedCount
                  const isFull = confirmedCount >= gs.maxParticipants
                  const spotsLeft = gs.maxParticipants - confirmedCount
                  const isAlmostFull = !isFull && spotsLeft <= 2
                  const sessionDate = new Date(gs.startAt)
                  const fillRatio = gs.maxParticipants > 0 ? Math.min(1, confirmedCount / gs.maxParticipants) : 0
                  const imageUrl = gs.imageUrl
                  const isExpanded = expandedIds.has(gs.id)
                  const isLongDescription = (gs.description?.length ?? 0) > 60

                  const theme = imageUrl ? {
                    cardBackground: `linear-gradient(180deg, rgba(10,10,10,0.20) 0%, rgba(10,10,10,0.82) 100%), url(${imageUrl}) center/cover no-repeat`,
                    border: '1px solid rgba(255,255,255,0.12)',
                    chipBg: 'rgba(255,255,255,0.16)',
                    title: '#FFFFFF',
                    secondary: 'rgba(255,255,255,0.82)',
                    price: '#FFFFFF',
                    barTrack: 'rgba(255,255,255,0.25)',
                    neutralFill: '#FFFFFF',
                    almostFill: '#FFC978',
                    fullFill: '#FF8A7A',
                  } : {
                    cardBackground: '#fff',
                    border: '1px solid #EEEAE3',
                    chipBg: '#F5F3F0',
                    title: '#1A1A18',
                    secondary: '#7A7570',
                    price: '#1A1A18',
                    barTrack: '#F0EDE8',
                    neutralFill: '#1A1A18',
                    almostFill: '#B8792E',
                    fullFill: '#C0392B',
                  }
                  const fillColor = isFull ? theme.fullFill : isAlmostFull ? theme.almostFill : theme.neutralFill

                  return (
                    <a
                      key={gs.id}
                      href={`/group-sessions/${gs.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: theme.cardBackground, borderRadius: 14, padding: 14,
                        border: theme.border,
                        boxShadow: imageUrl ? '0 4px 14px rgba(0,0,0,0.18)' : '0 1px 2px rgba(26,26,24,0.04)',
                        minHeight: imageUrl ? 118 : undefined,
                        cursor: 'pointer', textDecoration: 'none',
                        display: 'flex', alignItems: 'stretch', gap: 12,
                      }}
                    >
                      <div style={{
                        flexShrink: 0, width: 52, borderRadius: 10, background: theme.chipBg,
                        backdropFilter: imageUrl ? 'blur(4px)' : undefined,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 0',
                      }}>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.title, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                          {format(sessionDate, 'HH:mm')}
                        </p>
                      </div>

                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: theme.title, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                            {gs.title}
                          </p>
                          {gs.level && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: theme.secondary, background: theme.chipBg, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {GROUP_SESSION_LEVEL_LABELS[gs.level]}
                            </span>
                          )}
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
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpanded(gs.id) }}
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

                        {/* Barre de capacité */}
                        <div style={{ height: 3, borderRadius: 2, background: theme.barTrack, overflow: 'hidden', marginTop: 1 }}>
                          <div style={{ height: '100%', width: `${fillRatio * 100}%`, background: fillColor, borderRadius: 2, transition: 'width 0.2s' }} />
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
