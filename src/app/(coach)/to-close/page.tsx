'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import { CheckCircle, Clock, ChevronDown } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCollection } from '@/lib/hooks/useCollection'
import { db } from '@/lib/firebase/firestore'
import type { Session, User, Service, Client } from '@/types'

export default function ToClosePage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [coachFilter, setCoachFilter] = useState<string>('all')

  const { data: coaches } = useCollection<User>('users', [orderBy('firstName')])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])

  // IDs des clients visibles par ce coach
  const visibleClientIds = useMemo(
    () => new Set(clients.map(c => c.id)),
    [clients]
  )

  useEffect(() => {
    if (!user) { setLoading(false); return }

    setLoading(true)

    const q = isAdmin
      ? query(collection(db, 'sessions'), where('status', '==', 'planned'))
      : query(collection(db, 'sessions'), where('coachIds', 'array-contains', user.id))

    const now = Date.now()

    return onSnapshot(
      q,
      snap => {
        const past = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Session))
          .filter(s => s.status === 'planned' && s.endAt && s.endAt.toDate().getTime() <= now)
          .sort((a, b) => a.endAt.toDate().getTime() - b.endAt.toDate().getTime())
        setSessions(past)
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let result = sessions
    // Pour les coachs : n'afficher que les séances dont au moins un client leur est assigné
    if (!isAdmin) {
      result = result.filter(s => (s.clientIds ?? []).some(id => visibleClientIds.has(id)))
    }
    if (isAdmin && coachFilter !== 'all') {
      result = result.filter(s => (s.coachIds ?? []).includes(coachFilter))
    }
    return result
  }, [sessions, coachFilter, isAdmin, visibleClientIds])

  const now = Date.now()

  return (
    <>
      <TopBar title="À clôturer" />
      <TopBarSpacer />

      {/* Filtre par coach (admin uniquement) */}
      {isAdmin && coaches.length > 1 && (
        <div style={{ padding: '8px 16px 0' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={coachFilter}
              onChange={e => setCoachFilter(e.target.value)}
              style={{
                appearance: 'none', WebkitAppearance: 'none',
                background: '#fff', border: '1px solid #E5E1DA', borderRadius: 8,
                padding: '7px 32px 7px 12px', fontSize: 13, color: '#1A1A18',
                cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="all">Tous les coachs</option>
              {coaches.map(c => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: 10, pointerEvents: 'none', color: '#7A7570' }} />
          </div>
          {filtered.length > 0 && (
            <span style={{ fontSize: 12, color: '#A09890', marginLeft: 10 }}>
              {filtered.length} séance{filtered.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', gap: 12 }}>
          <CheckCircle size={44} color="#A09890" strokeWidth={1.5} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Tout est à jour</p>
          <p style={{ fontSize: 14, color: '#7A7570', margin: 0, textAlign: 'center' }}>
            {coachFilter !== 'all' ? 'Aucune séance à clôturer pour ce coach.' : 'Aucune séance passée à clôturer.'}
          </p>
        </div>
      ) : (
        <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(s => {
            const service = services.find(sv => sv.id === s.serviceId)
            const sessionCoaches = coaches.filter(c => (s.coachIds ?? []).includes(c.id))
            const start = s.startAt.toDate()
            const durationMin = Math.round((s.endAt.toDate().getTime() - start.getTime()) / 60000)
            const msAgo = now - start.getTime()
            const hoursAgo = Math.floor(msAgo / 3600000)
            const daysAgo = Math.floor(hoursAgo / 24)
            const ageLabel = hoursAgo < 24 ? `${hoursAgo}h` : `${daysAgo}j`
            const isUrgent = daysAgo >= 2

            return (
              <button
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}` as never)}
                style={{
                  background: '#fff', borderRadius: 10, padding: '12px 14px',
                  border: isUrgent ? '1px solid #FADBD8' : '1px solid transparent',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0 }}>
                      {service?.name ?? 'Service inconnu'}
                    </p>
                    <p style={{ fontSize: 13, color: '#7A7570', margin: '3px 0 0' }}>
                      {format(start, 'EEE d MMM · HH:mm', { locale: fr })} · {durationMin} min
                    </p>
                    {isAdmin && sessionCoaches.length > 0 && (
                      <p style={{ fontSize: 12, color: '#A09890', margin: '2px 0 0' }}>
                        {sessionCoaches.map(c => `${c.firstName} ${c.lastName}`).join(', ')}
                      </p>
                    )}
                    {(s.clientIds ?? []).length > 0 && (
                      <p style={{ fontSize: 12, color: '#A09890', margin: '1px 0 0' }}>
                        {(s.clientIds ?? [])
                          .map(id => { const c = clients.find(cl => cl.id === id); return c ? `${c.firstName} ${c.lastName}` : null })
                          .filter(Boolean).join(', ') || `${s.clientIds.length} client${s.clientIds.length > 1 ? 's' : ''}`}
                      </p>
                    )}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    color: isUrgent ? '#C0392B' : '#A09890', flexShrink: 0,
                  }}>
                    <Clock size={13} />
                    <span style={{ fontSize: 12, fontWeight: isUrgent ? 700 : 500 }}>{ageLabel}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
