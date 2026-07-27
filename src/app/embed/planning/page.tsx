'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, isToday, isTomorrow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Users2, ArrowUpRight } from 'lucide-react'
import { GROUP_SESSION_LEVEL_LABELS, type GroupSessionLevel } from '@/types'

interface EmbedSession {
  id: string
  title: string
  description?: string
  coachNames?: string[]
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
  const [items, setItems] = useState<EmbedSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    fetch('/api/group-sessions/public-list')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(({ items }: { items?: EmbedSession[] }) => setItems(items ?? []))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const byDay = new Map<string, EmbedSession[]>()
    items.forEach(it => {
      const key = format(new Date(it.startAt), 'yyyy-MM-dd')
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(it)
    })
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, dayItems]) => ({
        date: new Date(dayItems[0]!.startAt),
        items: dayItems.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
      }))
  }, [items])

  return (
    <div style={{ background: 'transparent', width: '100%', boxSizing: 'border-box', padding: '8px 4px', fontFamily: 'var(--font-sans, sans-serif)' }}>
      {loading ? (
        <p style={{ color: '#A09890', fontSize: 14, textAlign: 'center', padding: 24 }}>Chargement…</p>
      ) : groups.length === 0 ? (
        <p style={{ color: '#A09890', fontSize: 14, textAlign: 'center', padding: 24 }}>Aucune séance à venir</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {groups.map(group => (
            <div key={group.date.toISOString()}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, padding: '0 2px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1A18', margin: 0, textTransform: 'capitalize' }}>
                  {dayLabel(group.date)}
                </p>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {group.items.map(gs => {
                  const isFull = gs.confirmedCount >= gs.maxParticipants
                  const spotsLeft = gs.maxParticipants - gs.confirmedCount
                  const sessionDate = new Date(gs.startAt)
                  const imageUrl = gs.imageUrl

                  const theme = imageUrl ? {
                    cardBackground: `linear-gradient(180deg, rgba(10,10,10,0.20) 0%, rgba(10,10,10,0.82) 100%), url(${imageUrl}) center/100% auto no-repeat`,
                    border: '1px solid rgba(255,255,255,0.12)',
                    chipBg: 'rgba(255,255,255,0.16)',
                    title: '#FFFFFF',
                    secondary: 'rgba(255,255,255,0.82)',
                    price: '#FFFFFF',
                  } : {
                    cardBackground: '#fff',
                    border: '1px solid #EEEAE3',
                    chipBg: '#F5F3F0',
                    title: '#1A1A18',
                    secondary: '#7A7570',
                    price: '#1A1A18',
                  }

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
                          <p style={{ margin: 0, fontSize: 12, color: theme.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Avec {gs.coachNames.join(' & ')}
                          </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: theme.price, fontFamily: 'monospace' }}>
                            {gs.price.toFixed(2)} CHF
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {isFull ? (
                              <span style={{ fontSize: 11, fontWeight: 600, color: imageUrl ? '#FF8A7A' : '#C0392B' }}>Complet</span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Users2 size={12} color={theme.secondary} />
                                <span style={{ fontSize: 12, color: theme.secondary, fontVariantNumeric: 'tabular-nums' }}>
                                  {spotsLeft} place{spotsLeft > 1 ? 's' : ''}
                                </span>
                              </div>
                            )}
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 600, color: theme.title }}>
                              Réserver <ArrowUpRight size={13} />
                            </span>
                          </div>
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
