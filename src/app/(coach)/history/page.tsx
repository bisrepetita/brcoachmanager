'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Search, Filter, ChevronRight } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCollection } from '@/lib/hooks/useCollection'
import type { Session, User, Service, Client } from '@/types'

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  payment_to_request: 'À demander',
  link_sent: 'Lien envoyé',
  paid: 'Payé',
  offered: 'Offert',
  credits: 'Crédits',
  cancelled: 'Annulé',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  payment_to_request: '#F59E0B',
  link_sent: '#4285F4',
  paid: '#2D7A4F',
  offered: '#6366F1',
  credits: '#8B5CF6',
  cancelled: '#A09890',
}

// Calcule le statut de paiement effectif depuis paymentDistribution
function effectivePaymentStatus(session: Session): string {
  const dist = session.paymentDistribution ?? []
  if (dist.length === 0) return session.paymentStatus ?? 'payment_to_request'
  const statuses = dist.map(p => p.paymentStatus ?? session.paymentStatus ?? 'payment_to_request')
  if (statuses.every(s => s === 'paid')) return 'paid'
  if (statuses.every(s => s === 'offered')) return 'offered'
  if (statuses.every(s => s === 'credits')) return 'credits'
  if (statuses.some(s => s === 'paid') || statuses.some(s => s === 'link_sent')) return 'link_sent'
  return 'payment_to_request'
}

export default function HistoryPage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const { data: coaches } = useCollection<User>('users', [orderBy('firstName')])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterCoachId, setFilterCoachId] = useState('')
  const [filterServiceId, setFilterServiceId] = useState('')
  const [filterPayment, setFilterPayment] = useState('')

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services])
  const coachMap = useMemo(() => new Map(coaches.map(c => [c.id, c])), [coaches])

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    // Sans orderBy pour éviter l'index composite — tri en JS
    const constraints = isAdmin
      ? [where('status', '==', 'done')]
      : [where('status', '==', 'done'), where('coachIds', 'array-contains', user.id)]
    getDocs(query(collection(db, 'sessions'), ...constraints))
      .then(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session))
        data.sort((a, b) => (b.startAt?.seconds ?? 0) - (a.startAt?.seconds ?? 0))
        setSessions(data)
      })
      .catch(err => console.error('History fetch error:', err))
      .finally(() => setLoading(false))
  }, [user?.id, isAdmin])

  const filtered = useMemo(() => {
    let result = sessions
    if (filterCoachId) result = result.filter(s => s.coachIds?.includes(filterCoachId))
    if (filterServiceId) result = result.filter(s => s.serviceId === filterServiceId)
    if (filterPayment) result = result.filter(s => effectivePaymentStatus(s) === filterPayment)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(s => {
        const clientNames = (s.clientIds ?? []).map(id => {
          const c = clientMap.get(id)
          return c ? `${c.firstName} ${c.lastName}`.toLowerCase() : ''
        })
        const serviceName = serviceMap.get(s.serviceId)?.name?.toLowerCase() ?? ''
        return clientNames.some(n => n.includes(q)) || serviceName.includes(q)
      })
    }
    return result
  }, [sessions, filterCoachId, filterServiceId, filterPayment, search, clientMap, serviceMap])

  return (
    <>
      <TopBar
        title="Historique"
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
          <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
            style={{ flex: 1, minWidth: 120, height: 34, borderRadius: 8, border: '1px solid #E5E1DA', padding: '0 8px', fontSize: 13, background: '#fff' }}>
            <option value="">Tous les paiements</option>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}

      {/* Liste */}
      <div style={{ paddingBottom: 80 }}>
        {loading && (
          <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, paddingTop: 48 }}>Chargement…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, paddingTop: 48 }}>Aucune séance clôturée</p>
        )}

        {filtered.map((session, i) => {
          const prev = filtered[i - 1]
          const sessionDate = session.startAt?.toDate?.() ?? new Date()
          const prevDate = prev?.startAt?.toDate?.() ?? null
          const showMonth = !prevDate || format(sessionDate, 'yyyy-MM') !== format(prevDate, 'yyyy-MM')
          const service = serviceMap.get(session.serviceId)
          const clientNames = (session.clientIds ?? []).map(id => clientMap.get(id)?.firstName ?? '').filter(Boolean).join(', ')
          const coachNames = isAdmin ? (session.coachIds ?? []).map(id => coachMap.get(id)?.firstName ?? '').filter(Boolean).join(', ') : null
          const total = (session.paymentDistribution ?? []).reduce((s, p) => s + (p.amountDue ?? 0), 0)
          const paid = (session.paymentDistribution ?? []).reduce((s, p) => s + (p.amountPaid ?? 0), 0)
          const payStatus = effectivePaymentStatus(session)

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
                    <span style={{ fontSize: 11, fontWeight: 600, color: PAYMENT_STATUS_COLORS[payStatus] ?? '#A09890', background: `${PAYMENT_STATUS_COLORS[payStatus] ?? '#A09890'}18`, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {PAYMENT_STATUS_LABELS[payStatus] ?? payStatus}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A7570', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {format(sessionDate, 'HH:mm')} · {clientNames || '—'}
                    {coachNames ? ` · ${coachNames}` : ''}
                  </p>
                  {payStatus !== 'offered' && payStatus !== 'credits' && total > 0 && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: paid >= total ? '#2D7A4F' : '#F59E0B', fontWeight: 500 }}>
                      CHF {paid.toFixed(2)} / {total.toFixed(2)}
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
