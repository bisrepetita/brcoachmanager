'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { orderBy } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Search, Filter, ChevronRight } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCollection } from '@/lib/hooks/useCollection'
import { useVisibleClients } from '@/lib/hooks/useVisibleClients'
import type { Session, User, Service, Client } from '@/types'

export default function UpcomingPage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const { data: coaches } = useCollection<User>('users', [where('roles', 'array-contains', 'coach'), orderBy('firstName')])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: clients } = useVisibleClients('firstName')

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterCoachId, setFilterCoachId] = useState('')
  const [filterServiceId, setFilterServiceId] = useState('')

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services])
  const coachMap = useMemo(() => new Map(coaches.map(c => [c.id, c])), [coaches])

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    const nowSeconds = Date.now() / 1000
    const constraints = isAdmin
      ? [where('status', '==', 'planned')]
      : [where('status', '==', 'planned'), where('coachIds', 'array-contains', user.id)]
    getDocs(query(collection(db, 'sessions'), ...constraints))
      .then(snap => {
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Session))
          .filter(s => (s.startAt?.seconds ?? 0) >= nowSeconds)
        data.sort((a, b) => (a.startAt?.seconds ?? 0) - (b.startAt?.seconds ?? 0))
        setSessions(data)
      })
      .catch(err => console.error('[upcoming] fetch error:', err))
      .finally(() => setLoading(false))
  }, [user?.id, isAdmin])

  const filtered = useMemo(() => {
    let result = sessions
    if (filterCoachId) result = result.filter(s => s.coachIds?.includes(filterCoachId))
    if (filterServiceId) result = result.filter(s => s.serviceId === filterServiceId)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(s => {
        const clientNames = (s.clientIds ?? []).map(id => {
          const c = clientMap.get(id)
          return c ? `${c.firstName} ${c.lastName}`.toLowerCase() : ''
        })
        const serviceName = serviceMap.get(s.serviceId)?.name?.toLowerCase() ?? ''
        const note = s.sessionNote?.toLowerCase() ?? ''
        return clientNames.some(n => n.includes(q)) || serviceName.includes(q) || note.includes(q)
      })
    }
    return result
  }, [sessions, filterCoachId, filterServiceId, search, clientMap, serviceMap])

  return (
    <>
      <TopBar
        title="Séances à venir"
        right={
          <button
            onClick={() => setShowFilters(v => !v)}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E1DA', background: showFilters ? '#F0EDE8' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Filter size={15} color="#7A7570" />
          </button>
        }
      />
      <TopBarSpacer />

      {/* Toggle À venir / Passées */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E5E1DA', background: 'var(--color-surface)' }}>
        <span style={{ flex: 1, textAlign: 'center', padding: '9px 0', fontSize: 13, fontWeight: 700, color: '#1A1A18', borderBottom: '2px solid #1A1A18' }}>
          À venir
        </span>
        <button
          onClick={() => router.push('/history' as never)}
          style={{ flex: 1, textAlign: 'center', padding: '9px 0', fontSize: 13, fontWeight: 400, color: '#A09890', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer' }}
        >
          Passées
        </button>
      </div>

      {/* Recherche */}
      <div style={{ padding: '10px 14px 0', background: 'var(--color-surface)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#A09890' }} />
          <input
            placeholder="Client, service…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 36, paddingLeft: 30, paddingRight: 10, border: '1px solid #E5E1DA', borderRadius: 8, fontSize: 14, background: '#F9F8F6', outline: 'none', color: '#1A1A18', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Filtres */}
      {showFilters && (
        <div style={{ padding: '10px 14px', background: '#F9F8F6', borderBottom: '1px solid #E5E1DA', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <select value={filterCoachId} onChange={e => setFilterCoachId(e.target.value)}
              style={{ flex: 1, minWidth: 120, height: 34, borderRadius: 8, border: '1px solid #E5E1DA', padding: '0 8px', fontSize: 13, background: '#fff' }}>
              <option value="">Tous les coachs</option>
              {coaches.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          )}
          <select value={filterServiceId} onChange={e => setFilterServiceId(e.target.value)}
            style={{ flex: 1, minWidth: 120, height: 34, borderRadius: 8, border: '1px solid #E5E1DA', padding: '0 8px', fontSize: 13, background: '#fff' }}>
            <option value="">Tous les services</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {/* Liste */}
      <div style={{ paddingBottom: 80 }}>
        {loading && (
          <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, paddingTop: 48 }}>Chargement…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, paddingTop: 48 }}>Aucune séance à venir</p>
        )}

        {filtered.map((session, i) => {
          const prev = filtered[i - 1]
          const sessionDate = session.startAt?.toDate?.() ?? new Date()
          const prevDate = prev?.startAt?.toDate?.() ?? null
          const showMonth = !prevDate || format(sessionDate, 'yyyy-MM') !== format(prevDate, 'yyyy-MM')
          const service = serviceMap.get(session.serviceId)
          const clientNames = (session.clientIds ?? []).map(id => clientMap.get(id)?.firstName ?? '').filter(Boolean).join(', ')
          const coachNames = isAdmin ? (session.coachIds ?? []).map(id => coachMap.get(id)?.firstName ?? '').filter(Boolean).join(', ') : null
          const endDate = session.endAt?.toDate?.()
          const duration = endDate ? Math.round((endDate.getTime() - sessionDate.getTime()) / 60000) : null

          return (
            <div key={session.id}>
              {showMonth && (
                <p style={{ fontSize: 11, fontWeight: 700, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 14px 6px' }}>
                  {format(sessionDate, 'MMMM yyyy', { locale: fr })}
                </p>
              )}
              <button
                onClick={() => router.push(`/sessions/${session.id}` as never)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', width: '100%', background: 'none', border: 'none', borderBottom: '1px solid #F5F3F0', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A1A18', lineHeight: 1 }}>{format(sessionDate, 'd')}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#A09890', textTransform: 'uppercase' }}>{format(sessionDate, 'MMM', { locale: fr })}</p>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {service?.name ?? session.priceSnapshot?.serviceName ?? '—'}
                    </p>
                    {duration && (
                      <span style={{ fontSize: 11, color: '#A09890', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {duration} min
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A7570', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {format(sessionDate, 'HH:mm')} · {clientNames || '—'}
                    {coachNames ? ` · ${coachNames}` : ''}
                  </p>
                  {session.sessionNote && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#A09890', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.sessionNote}
                    </p>
                  )}
                </div>

                <ChevronRight size={14} style={{ color: '#C8C4BC', flexShrink: 0 }} />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
