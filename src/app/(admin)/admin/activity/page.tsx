'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, orderBy, limit, getDocs, startAfter, where, Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, Filter } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import type { User } from '@/types'
import type { ActivityAction } from '@/lib/services/activity.service'

interface ActivityLog {
  id: string
  userId: string
  userFirstName: string
  userLastName: string
  action: ActivityAction
  description: string
  sessionId?: string
  clientId?: string
  createdAt: Timestamp
}

const ACTION_LABELS: Record<ActivityAction, string> = {
  session_created: 'Séance créée',
  session_edited: 'Séance modifiée',
  session_cancelled: 'Séance annulée',
  session_deleted: 'Séance supprimée',
  session_done: 'Séance clôturée',
  payment_updated: 'Paiement mis à jour',
  client_created: 'Client créé',
  client_edited: 'Client modifié',
  client_deleted: 'Client supprimé',
  credit_added: 'Crédit ajouté',
  credit_used: 'Crédit utilisé',
}

const ACTION_COLORS: Record<ActivityAction, string> = {
  session_created: '#2D7A4F',
  session_edited: '#4285F4',
  session_cancelled: '#C0392B',
  session_deleted: '#7A7570',
  session_done: '#6366F1',
  payment_updated: '#F59E0B',
  client_created: '#10B981',
  client_edited: '#0EA5E9',
  client_deleted: '#A09890',
  credit_added: '#2D7A4F',
  credit_used: '#8B5CF6',
}

const PAGE_SIZE = 30

export default function ActivityPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [filterCoachId, setFilterCoachId] = useState('')
  const [filterAction, setFilterAction] = useState<ActivityAction | ''>('')
  const [showFilters, setShowFilters] = useState(false)

  const { data: coaches } = useCollection<User>('users', [orderBy('firstName')])

  async function fetchLogs(reset = false) {
    setLoading(true)
    try {
      let q = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
      if (filterCoachId) q = query(collection(db, 'activityLogs'), where('userId', '==', filterCoachId), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
      if (!reset && lastDoc) q = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE))

      const snap = await getDocs(q)
      const newLogs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog))
      setLogs(prev => reset ? newLogs : [...prev, ...newLogs])
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
      setHasMore(snap.docs.length === PAGE_SIZE)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs(true) }, [filterCoachId, filterAction])

  const filtered = useMemo(() =>
    filterAction ? logs.filter(l => l.action === filterAction) : logs,
    [logs, filterAction]
  )

  return (
    <>
      <TopBar
        title="Journal d'activité"
        left={<button onClick={() => router.back()} className="p-2 -ml-2"><ChevronLeft size={20} /></button>}
        right={
          <button onClick={() => setShowFilters(v => !v)}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E1DA', background: showFilters ? '#F0EDE8' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Filter size={15} color="#7A7570" />
          </button>
        }
      />
      <TopBarSpacer />

      {showFilters && (
        <div style={{ padding: '12px 16px', background: '#F9F8F6', borderBottom: '1px solid #E5E1DA', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filterCoachId} onChange={e => setFilterCoachId(e.target.value)}
            style={{ flex: 1, minWidth: 120, height: 34, borderRadius: 8, border: '1px solid #E5E1DA', padding: '0 8px', fontSize: 13, background: '#fff', color: '#1A1A18' }}>
            <option value="">Tous les coachs</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value as ActivityAction | '')}
            style={{ flex: 1, minWidth: 140, height: 34, borderRadius: 8, border: '1px solid #E5E1DA', padding: '0 8px', fontSize: 13, background: '#fff', color: '#1A1A18' }}>
            <option value="">Toutes les actions</option>
            {(Object.entries(ACTION_LABELS) as [ActivityAction, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ padding: '0 0 80px' }}>
        {filtered.length === 0 && !loading && (
          <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, paddingTop: 48 }}>Aucune activité</p>
        )}

        {filtered.map((log, i) => {
          const prev = filtered[i - 1]
          const logDate = log.createdAt?.toDate?.() ?? new Date()
          const prevDate = prev?.createdAt?.toDate?.() ?? null
          const showDay = !prevDate || format(logDate, 'yyyy-MM-dd') !== format(prevDate, 'yyyy-MM-dd')

          return (
            <div key={log.id}>
              {showDay && (
                <p style={{ fontSize: 11, fontWeight: 700, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 16px 6px' }}>
                  {format(logDate, 'EEEE d MMMM yyyy', { locale: fr })}
                </p>
              )}
              <div
                style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F5F3F0', cursor: (log.sessionId || log.clientId) ? 'pointer' : 'default' }}
                onClick={() => {
                  if (log.sessionId) router.push(`/sessions/${log.sessionId}` as never)
                  else if (log.clientId) router.push(`/clients/${log.clientId}` as never)
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${ACTION_COLORS[log.action]}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACTION_COLORS[log.action] }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>
                      {log.userFirstName} {log.userLastName}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#A09890', flexShrink: 0 }}>
                      {format(logDate, 'HH:mm')}
                    </p>
                  </div>
                  <p style={{ margin: '1px 0 0', fontSize: 12, color: ACTION_COLORS[log.action], fontWeight: 500 }}>
                    {ACTION_LABELS[log.action]}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#7A7570', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.description}
                  </p>
                </div>
              </div>
            </div>
          )
        })}

        {hasMore && !loading && (
          <button onClick={() => fetchLogs(false)}
            style={{ display: 'block', margin: '16px auto', padding: '10px 24px', borderRadius: 8, border: '1px solid #E5E1DA', background: '#fff', fontSize: 14, color: '#1A1A18', cursor: 'pointer' }}>
            Charger plus
          </button>
        )}

        {loading && (
          <p style={{ textAlign: 'center', color: '#A09890', fontSize: 14, paddingTop: 32 }}>Chargement…</p>
        )}
      </div>
    </>
  )
}
