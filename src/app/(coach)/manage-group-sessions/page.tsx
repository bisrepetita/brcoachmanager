'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, Users2 } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import type { GroupSession } from '@/types'

export default function GroupSessionsCoachPage() {
  const router = useRouter()
  const [items, setItems] = useState<GroupSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'groupSessions'), orderBy('startAt', 'desc'))
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupSession)))
      setLoading(false)
    }, () => setLoading(false))
  }, [])

  return (
    <>
      <TopBar
        title="Séances collectives"
        right={
          <button
            onClick={() => router.push('/sessions/new?public=1' as never)}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#1A1A18', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Plus size={18} color="#fff" />
          </button>
        }
      />
      <TopBarSpacer />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', gap: 12 }}>
          <Users2 size={44} color="#A09890" strokeWidth={1.5} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Aucune séance collective</p>
          <p style={{ fontSize: 14, color: '#7A7570', margin: 0, textAlign: 'center' }}>
            Créez-en une avec le bouton +.
          </p>
        </div>
      ) : (
        <div style={{ padding: '12px 16px 80px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(gs => {
            const confirmedCount = gs.enrollments.filter(e => e.status !== 'cancelled').length
            const date = gs.startAt?.toDate ? format(gs.startAt.toDate(), 'd MMM yyyy HH:mm', { locale: fr }) : '—'

            return (
              <button
                key={gs.id}
                onClick={() => router.push(`/manage-group-sessions/${gs.id}` as never)}
                style={{
                  background: '#fff', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0 }}>{gs.title}</p>
                    <p style={{ fontSize: 12, color: '#A09890', margin: '2px 0 0' }}>{date}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0, fontFamily: 'monospace' }}>
                      {confirmedCount}/{gs.maxParticipants}
                    </p>
                    {!gs.isPublic && (
                      <p style={{ fontSize: 11, color: '#A09890', margin: 0 }}>Non publié</p>
                    )}
                    {gs.status === 'cancelled' && (
                      <p style={{ fontSize: 11, color: '#C0392B', margin: 0 }}>Annulée</p>
                    )}
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
