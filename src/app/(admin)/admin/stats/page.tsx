'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, eachDayOfInterval, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Session, User, Service } from '@/types'

export default function StatsPage() {
  const router = useRouter()
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()))
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [filterCoachId, setFilterCoachId] = useState('')
  const [filterServiceId, setFilterServiceId] = useState('')
  const [view, setView] = useState<'summary' | 'daily'>('summary')

  const { data: coaches } = useCollection<User>('users', [orderBy('firstName')])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])

  useEffect(() => {
    setLoading(true)
    const start = startOfMonth(monthAnchor)
    const end = endOfMonth(monthAnchor)
    getDocs(query(
      collection(db, 'sessions'),
      where('startAt', '>=', Timestamp.fromDate(start)),
      where('startAt', '<=', Timestamp.fromDate(end)),
    )).then(snap => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Session))
    }).finally(() => setLoading(false))
  }, [monthAnchor])

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      if (filterCoachId && !s.coachIds.includes(filterCoachId)) return false
      if (filterServiceId && s.serviceId !== filterServiceId) return false
      return true
    })
  }, [sessions, filterCoachId, filterServiceId])

  const stats = useMemo(() => {
    const planned = filtered.filter(s => s.status === 'planned').length
    const done = filtered.filter(s => s.status === 'done').length
    const cancelled = filtered.filter(s => s.status === 'cancelled').length

    // Pour les séances indépendantes : CA = location (roomRentalSnapshot)
    // Pour les séances normales : CA = service (paymentDistribution)
    function sessionRevenue(s: Session): number {
      if (s.isIndependent) {
        return (s.roomRentalSnapshot ?? []).reduce((a, r) => a + (r.amountDueToCompany ?? 0), 0)
      }
      return (s.paymentDistribution ?? []).reduce((a, p) => a + (p.amountDue ?? 0), 0)
    }

    function sessionPaid(s: Session): number {
      if (s.isIndependent) {
        return (s.roomRentalSnapshot ?? []).filter(r => r.status === 'paid').reduce((a, r) => a + (r.amountDueToCompany ?? 0), 0)
      }
      return (s.paymentDistribution ?? []).reduce((a, p) => a + (p.amountPaid ?? 0), 0)
    }

    const revenue = filtered.filter(s => s.status !== 'cancelled').reduce((sum, s) => sum + sessionRevenue(s), 0)
    const paid = filtered.filter(s => s.status !== 'cancelled').reduce((sum, s) => sum + sessionPaid(s), 0)

    // Par service
    const byService: Record<string, { name: string; count: number; revenue: number }> = {}
    filtered.filter(s => s.status !== 'cancelled').forEach(s => {
      const name = services.find(sv => sv.id === s.serviceId)?.name ?? s.priceSnapshot?.serviceName ?? s.serviceId
      if (!byService[s.serviceId]) byService[s.serviceId] = { name, count: 0, revenue: 0 }
      byService[s.serviceId]!.count++
      byService[s.serviceId]!.revenue += sessionRevenue(s)
    })

    // Par coach
    const byCoach: Record<string, { name: string; count: number }> = {}
    filtered.filter(s => s.status !== 'cancelled').forEach(s => {
      s.coachIds.forEach(cId => {
        const coach = coaches.find(c => c.id === cId)
        const name = coach ? `${coach.firstName} ${coach.lastName}` : cId
        if (!byCoach[cId]) byCoach[cId] = { name, count: 0 }
        byCoach[cId]!.count++
      })
    })

    // Par jour
    const days = eachDayOfInterval({ start: startOfMonth(monthAnchor), end: endOfMonth(monthAnchor) })
    const byDay = days.map(day => {
      const daySessions = filtered.filter(s => s.status !== 'cancelled' && isSameDay(s.startAt?.toDate?.() ?? new Date(0), day))
      const dayRevenue = daySessions.reduce((a, s) => a + sessionRevenue(s), 0)
      const dayPaid = daySessions.reduce((a, s) => a + sessionPaid(s), 0)
      return { day, sessions: daySessions, count: daySessions.length, revenue: dayRevenue, paid: dayPaid }
    }).filter(d => d.count > 0)

    return { planned, done, cancelled, revenue, paid, byService, byCoach, byDay }
  }, [filtered, services, coaches, monthAnchor])

  const selectStyle: React.CSSProperties = {
    height: 36, border: '1px solid #E5E1DA', borderRadius: 8,
    padding: '0 10px', fontSize: 13, color: '#1A1A18',
    background: '#F9F8F6', outline: 'none', flex: 1,
  }

  return (
    <>
      <TopBar
        title="Statistiques"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Navigation mois */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 10, padding: '10px 14px' }}>
          <button onClick={() => setMonthAnchor(m => startOfMonth(subMonths(m, 1)))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={20} color="#7A7570" />
          </button>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', textTransform: 'capitalize' }}>
            {format(monthAnchor, 'MMMM yyyy', { locale: fr })}
          </p>
          <button onClick={() => setMonthAnchor(m => startOfMonth(addMonths(m, 1)))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronRight size={20} color="#7A7570" />
          </button>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filterCoachId} onChange={e => setFilterCoachId(e.target.value)} style={selectStyle}>
            <option value="">Tous les coachs</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
          </select>
          <select value={filterServiceId} onChange={e => setFilterServiceId(e.target.value)} style={selectStyle}>
            <option value="">Tous les services</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Toggle vue */}
        <div style={{ display: 'flex', gap: 4, background: '#F0EDE8', borderRadius: 8, padding: 3 }}>
          {(['summary', 'daily'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ flex: 1, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: view === v ? '#fff' : 'transparent', color: view === v ? '#1A1A18' : '#7A7570' }}>
              {v === 'summary' ? 'Résumé' : 'Par jour'}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, padding: 20 }}>Chargement…</p>
        ) : (
          <>
            {view === 'daily' ? (
              <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #F0EDE8', display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Jour</p>
                  <div style={{ display: 'flex', gap: 32 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Séances</p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>CA</p>
                  </div>
                </div>
                {stats.byDay.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, padding: '20px 0' }}>Aucune séance ce mois-ci</p>
                )}
                {stats.byDay.map(({ day, count, revenue, paid: dayPaid, sessions: daySessions }) => {
                  const serviceNames = [...new Set(daySessions.map(s => services.find(sv => sv.id === s.serviceId)?.name ?? s.priceSnapshot?.serviceName ?? '—'))].join(', ')
                  return (
                    <div key={day.toISOString()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #F5F3F0' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A18', textTransform: 'capitalize' }}>
                          {format(day, 'EEEE d', { locale: fr })}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#A09890', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{serviceNames}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A18', textAlign: 'center', minWidth: 32 }}>{count}</p>
                        <div style={{ textAlign: 'right', minWidth: 80 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>CHF {revenue.toFixed(0)}</p>
                          {dayPaid > 0 && dayPaid < revenue && (
                            <p style={{ margin: 0, fontSize: 11, color: '#F59E0B' }}>encaissé {dayPaid.toFixed(0)}</p>
                          )}
                          {dayPaid >= revenue && revenue > 0 && (
                            <p style={{ margin: 0, fontSize: 11, color: '#2D7A4F' }}>✓ encaissé</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {stats.byDay.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#F9F8F6' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>Total</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A1A18' }}>CHF {stats.revenue.toFixed(2)}</p>
                  </div>
                )}
              </div>
            ) : (
            <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Planifiées', value: stats.planned, color: '#1A1A18' },
                { label: 'Effectuées', value: stats.done, color: '#2D7A4F' },
                { label: 'CA total (CHF)', value: stats.revenue.toFixed(2), color: '#1A1A18' },
                { label: 'Encaissé (CHF)', value: stats.paid.toFixed(2), color: '#2D7A4F' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color, margin: '4px 0 0' }}>{value}</p>
                </div>
              ))}
            </div>

            {stats.cancelled > 0 && (
              <p style={{ fontSize: 12, color: '#A09890', textAlign: 'center' }}>{stats.cancelled} séance{stats.cancelled > 1 ? 's' : ''} annulée{stats.cancelled > 1 ? 's' : ''} (non comptée{stats.cancelled > 1 ? 's' : ''})</p>
            )}

            {/* Par service */}
            {Object.values(stats.byService).length > 0 && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Par service</p>
                {Object.values(stats.byService).sort((a, b) => b.count - a.count).map(({ name, count, revenue }) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F0EDE8' }}>
                    <div>
                      <p style={{ fontSize: 14, color: '#1A1A18', margin: 0 }}>{name}</p>
                      <p style={{ fontSize: 12, color: '#A09890', margin: 0 }}>{count} séance{count > 1 ? 's' : ''}</p>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1A1A18', margin: 0 }}>CHF {revenue.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Par coach */}
            {Object.values(stats.byCoach).length > 0 && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Par coach</p>
                {Object.values(stats.byCoach).sort((a, b) => b.count - a.count).map(({ name, count }) => {
                  const coach = coaches.find(c => `${c.firstName} ${c.lastName}` === name)
                  return (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F0EDE8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {coach && <div style={{ width: 28, height: 28, borderRadius: '50%', background: coach.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#fff', flexShrink: 0 }}>{coach.firstName[0]}{coach.lastName[0]}</div>}
                        <p style={{ fontSize: 14, color: '#1A1A18', margin: 0 }}>{name}</p>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#1A1A18', margin: 0 }}>{count} séance{count > 1 ? 's' : ''}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {filtered.length === 0 && (
              <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, padding: 20 }}>Aucune séance ce mois-ci.</p>
            )}
            </>
            )}
          </>
        )}
      </div>
    </>
  )
}
