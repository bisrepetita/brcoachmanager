'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ticket } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/firebase/firestore'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { GROUP_SESSION_ENROLLMENT_STATUS_LABELS } from '@/types'
import type { GroupSession, GroupSessionEnrollmentStatus } from '@/types'

const BADGE_VARIANT: Record<GroupSessionEnrollmentStatus, 'payment_to_request' | 'paid' | 'cancelled'> = {
  pending_payment: 'payment_to_request',
  confirmed: 'paid',
  cancelled: 'cancelled',
}

export default function MyEnrollmentsPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useClientProfile()
  const [items, setItems] = useState<GroupSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'groupSessions'),
      where('isPublic', '==', true),
      where('status', 'in', ['planned', 'done']),
    )
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupSession)))
      setLoading(false)
    }, () => setLoading(false))
  }, [])

  const myEnrollments = useMemo(() => {
    if (!profile) return []
    return items
      .map(gs => ({ gs, enrollment: gs.enrollments.find(e => e.clientId === profile.clientId) }))
      .filter((x): x is { gs: GroupSession; enrollment: NonNullable<typeof x.enrollment> } => !!x.enrollment)
      .sort((a, b) => (b.gs.startAt?.toMillis?.() ?? 0) - (a.gs.startAt?.toMillis?.() ?? 0))
  }, [items, profile])

  return (
    <>
      <TopBar title="Mes inscriptions" />
      <TopBarSpacer />

      {loading || profileLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
        </div>
      ) : myEnrollments.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', gap: 12 }}>
          <Ticket size={44} color="#A09890" strokeWidth={1.5} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Aucune inscription</p>
          <p style={{ fontSize: 14, color: '#7A7570', margin: 0, textAlign: 'center' }}>
            Inscris-toi à une séance depuis l&apos;onglet Planning.
          </p>
        </div>
      ) : (
        <div style={{ padding: '12px 16px 80px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {myEnrollments.map(({ gs, enrollment }) => {
            const date = gs.startAt?.toDate ? format(gs.startAt.toDate(), 'd MMM yyyy · HH:mm', { locale: fr }) : '—'
            return (
              <button
                key={gs.id}
                onClick={() => router.push(`/group-sessions/${gs.id}` as never)}
                style={{
                  background: '#fff', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0 }}>{gs.title}</p>
                    <p style={{ fontSize: 12, color: '#A09890', margin: '2px 0 0' }}>{date}</p>
                    <p style={{ fontSize: 12, color: '#7A7570', margin: '2px 0 0', fontFamily: 'monospace' }}>
                      {enrollment.originalAmountDue !== undefined && (
                        <span style={{ textDecoration: 'line-through', color: '#A09890', marginRight: 4 }}>
                          {enrollment.originalAmountDue.toFixed(2)} CHF
                        </span>
                      )}
                      {enrollment.amountDue.toFixed(2)} CHF
                    </p>
                  </div>
                  <Badge variant={BADGE_VARIANT[enrollment.status]}>
                    {GROUP_SESSION_ENROLLMENT_STATUS_LABELS[enrollment.status]}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
