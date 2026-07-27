'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ticket, Repeat, ChevronRight } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { findActiveSubscriptionForClient } from '@/lib/services/subscription.service'
import { GROUP_SESSION_ENROLLMENT_STATUS_LABELS, DAY_OF_WEEK_LABELS } from '@/types'
import type { GroupSession, GroupSessionEnrollmentStatus, ClientSubscription } from '@/types'
import { AuthGuard } from '@/components/providers/AuthGuard'

const BADGE_VARIANT: Record<GroupSessionEnrollmentStatus, 'payment_to_request' | 'paid' | 'cancelled'> = {
  pending_payment: 'payment_to_request',
  confirmed: 'paid',
  cancelled: 'cancelled',
}

export default function MyEnrollmentsPage() {
  return (
    <AuthGuard requireClient>
      <MyEnrollmentsContent />
    </AuthGuard>
  )
}

function MyEnrollmentsContent() {
  const router = useRouter()
  const { firebaseUser } = useAuth()
  const { profile, loading: profileLoading } = useClientProfile()
  const [items, setItems] = useState<GroupSession[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSubscription, setActiveSubscription] = useState<ClientSubscription | null>(null)
  const [subLoading, setSubLoading] = useState(true)

  useEffect(() => {
    if (!profile || !firebaseUser?.uid) { setActiveSubscription(null); setSubLoading(false); return }
    let cancelled = false
    findActiveSubscriptionForClient(profile.clientId, firebaseUser.uid)
      .then(sub => { if (!cancelled) setActiveSubscription(sub) })
      .finally(() => { if (!cancelled) setSubLoading(false) })
    return () => { cancelled = true }
  }, [profile, firebaseUser?.uid])

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

      {!subLoading && (
        <div style={{ padding: '12px 16px 0' }}>
          {activeSubscription ? (
            <button
              onClick={() => router.push('/subscriptions' as never)}
              style={{
                width: '100%', textAlign: 'left', background: '#1A1A18', borderRadius: 12, padding: 16,
                color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Repeat size={15} />
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Abonnement actif</p>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 700 }}>{activeSubscription.planSnapshot.name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, opacity: 0.75 }}>
                  Jusqu&apos;au {format(activeSubscription.endAt.toDate(), 'd MMMM yyyy', { locale: fr })} · {activeSubscription.planSnapshot.sessionsPerWeek}x/semaine
                  {activeSubscription.planSnapshot.fixedSlot && ` · ${DAY_OF_WEEK_LABELS[activeSubscription.planSnapshot.fixedSlot.dayOfWeek]} ${activeSubscription.planSnapshot.fixedSlot.startTime}`}
                </p>
              </div>
              <ChevronRight size={16} style={{ opacity: 0.7, flexShrink: 0 }} />
            </button>
          ) : (
            <button
              onClick={() => router.push('/subscriptions' as never)}
              style={{
                width: '100%', textAlign: 'left', background: '#fff', borderRadius: 12, padding: 14,
                border: '1px dashed #C8C4BC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <Repeat size={16} color="#7A7570" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>Pas d&apos;abonnement — en prendre un</span>
              <ChevronRight size={16} color="#A09890" style={{ flexShrink: 0 }} />
            </button>
          )}
        </div>
      )}

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
