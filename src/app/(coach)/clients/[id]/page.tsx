'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Phone, Mail, MapPin, CreditCard } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import type { Client, Session, Service } from '@/types'

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

export default function ClientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'done' | 'planned'>('done')

  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services])

  useEffect(() => {
    if (!clientId) return
    // Charger le client
    getDoc(doc(db, 'clients', clientId)).then(snap => {
      if (snap.exists()) setClient({ id: snap.id, ...snap.data() } as Client)
      setLoading(false)
    }).catch(() => setLoading(false))
    // Charger les sessions séparément (sans orderBy pour éviter l'index composite)
    getDocs(query(collection(db, 'sessions'), where('clientIds', 'array-contains', clientId)))
      .then(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session))
        data.sort((a, b) => b.startAt.seconds - a.startAt.seconds)
        setSessions(data)
      }).catch(() => {})
  }, [clientId])

  const doneSessions = useMemo(() => sessions.filter(s => s.status === 'done'), [sessions])
  const plannedSessions = useMemo(() => sessions.filter(s => s.status === 'planned'), [sessions])

  const totalDue = useMemo(() => doneSessions.reduce((sum, s) => {
    const dist = s.paymentDistribution?.find(p => p.clientId === clientId)
    return sum + (dist?.amountDue ?? 0)
  }, 0), [doneSessions, clientId])

  const totalPaid = useMemo(() => doneSessions.reduce((sum, s) => {
    const dist = s.paymentDistribution?.find(p => p.clientId === clientId)
    return sum + (dist?.amountPaid ?? 0)
  }, 0), [doneSessions, clientId])

  if (loading) return <div className="flex items-center justify-center h-screen text-sm text-text-secondary">Chargement…</div>
  if (!client) return <div className="flex items-center justify-center h-screen text-sm text-text-secondary">Client introuvable</div>

  const displayedSessions = tab === 'done' ? doneSessions : plannedSessions

  return (
    <>
      <TopBar
        title={`${client.firstName} ${client.lastName}`}
        left={<button onClick={() => router.back()} className="p-2 -ml-2"><ChevronLeft size={20} /></button>}
      />
      <TopBarSpacer />

      {/* Infos client */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {client.phone && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Phone size={14} color="#A09890" />
              <p style={{ margin: 0, fontSize: 14, color: '#1A1A18' }}>{client.phone}</p>
            </div>
          )}
          {client.email && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Mail size={14} color="#A09890" />
              <p style={{ margin: 0, fontSize: 14, color: '#1A1A18' }}>{client.email}</p>
            </div>
          )}
          {(client.city || client.postalCode) && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <MapPin size={14} color="#A09890" />
              <p style={{ margin: 0, fontSize: 14, color: '#1A1A18' }}>{[client.postalCode, client.city].filter(Boolean).join(' ')}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <CreditCard size={14} color="#A09890" />
            <p style={{ margin: 0, fontSize: 14, color: '#1A1A18' }}>{client.sessionCredits} crédit{client.sessionCredits !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* KPIs paiement */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Séances', value: String(doneSessions.length) },
            { label: 'Total dû', value: `CHF ${totalDue.toFixed(0)}` },
            { label: 'Encaissé', value: `CHF ${totalPaid.toFixed(0)}`, color: totalPaid >= totalDue ? '#2D7A4F' : '#F59E0B' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: color ?? '#1A1A18' }}>{value}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#A09890' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 6, background: '#F0EDE8', borderRadius: 8, padding: 3 }}>
          {([['done', `Effectuées (${doneSessions.length})`], ['planned', `À venir (${plannedSessions.length})`]] as [typeof tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#1A1A18' : '#7A7570' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Sessions */}
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
          {displayedSessions.length === 0 && (
            <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, padding: '24px 0' }}>Aucune séance</p>
          )}
          {displayedSessions.map((session, i) => {
            const sessionDate = session.startAt?.toDate?.() ?? new Date()
            const service = serviceMap.get(session.serviceId)
            const dist = session.paymentDistribution?.find(p => p.clientId === clientId)
            const status = dist?.paymentStatus ?? session.paymentStatus

            return (
              <button key={session.id} onClick={() => router.push(`/sessions/${session.id}` as never)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', width: '100%', background: 'none', border: 'none', borderTop: i > 0 ? '1px solid #F5F3F0' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A1A18', lineHeight: 1 }}>{format(sessionDate, 'd')}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#A09890', textTransform: 'uppercase' }}>{format(sessionDate, 'MMM', { locale: fr })}</p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A1A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {service?.name ?? session.priceSnapshot?.serviceName ?? '—'}
                    </p>
                    {tab === 'done' && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: PAYMENT_STATUS_COLORS[status] ?? '#A09890', background: `${PAYMENT_STATUS_COLORS[status]}18`, padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {PAYMENT_STATUS_LABELS[status] ?? status}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A7570' }}>
                    {format(sessionDate, 'HH:mm')}
                    {tab === 'done' && dist && ` · CHF ${(dist.amountPaid ?? 0).toFixed(0)}/${(dist.amountDue ?? 0).toFixed(0)}`}
                  </p>
                </div>
                <ChevronRight size={14} color="#C8C4BC" />
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
