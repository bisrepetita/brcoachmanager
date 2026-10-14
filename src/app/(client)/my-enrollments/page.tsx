'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ticket, Repeat, ChevronRight, Layers } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { findActiveSubscriptionForClient } from '@/lib/services/subscription.service'
import { fetchMyPrivateGroupSessions } from '@/lib/services/group-session.service'
import { findClientPacks, isPackUsable } from '@/lib/services/pack.service'
import { GROUP_SESSION_ENROLLMENT_STATUS_LABELS, DAY_OF_WEEK_LABELS } from '@/types'
import type { GroupSession, GroupSessionEnrollmentStatus, ClientSubscription, PrivateSessionView, ClientPack } from '@/types'
import { AuthGuard } from '@/components/providers/AuthGuard'

// Vue commune aux séances publiques (lecture Firestore) et aux séances de groupe privé (route API)
interface MyEnrollmentItem {
  id: string
  title: string
  startAt: Date
  status: GroupSessionEnrollmentStatus
  amountDue: number
  originalAmountDue?: number
  privateGroupName?: string
  viaPack?: boolean
}

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
  const [privateItems, setPrivateItems] = useState<PrivateSessionView[]>([])
  const [usablePacks, setUsablePacks] = useState<ClientPack[]>([])

  useEffect(() => {
    if (!profile || !firebaseUser?.uid) { setUsablePacks([]); return }
    let cancelled = false
    findClientPacks(profile.clientId, firebaseUser.uid)
      .then(list => { if (!cancelled) setUsablePacks(list.filter(p => isPackUsable(p))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [profile, firebaseUser?.uid])
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

  useEffect(() => {
    if (!firebaseUser) return
    let cancelled = false
    fetchMyPrivateGroupSessions().then(list => { if (!cancelled) setPrivateItems(list) })
    return () => { cancelled = true }
  }, [firebaseUser])

  const myEnrollments = useMemo((): MyEnrollmentItem[] => {
    if (!profile) return []
    const fromPublic = items.flatMap(gs => {
      const enrollment = gs.enrollments.find(e => e.clientId === profile.clientId)
      if (!enrollment || !gs.startAt?.toDate) return []
      return [{
        id: gs.id, title: gs.title, startAt: gs.startAt.toDate(), status: enrollment.status,
        amountDue: enrollment.amountDue, originalAmountDue: enrollment.originalAmountDue,
        viaPack: !!enrollment.clientPackId,
      }]
    })
    // Les séances privées n'exposent que l'inscription active (non annulée) du client
    const fromPrivate = privateItems.flatMap(s => s.myEnrollment ? [{
      id: s.id, title: s.title, startAt: new Date(s.startAt), status: s.myEnrollment.status,
      amountDue: s.myEnrollment.amountDue, privateGroupName: s.privateGroupName,
    }] : [])
    return [...fromPublic, ...fromPrivate].sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
  }, [items, privateItems, profile])

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
          <button
            onClick={() => router.push('/packs' as never)}
            style={{
              width: '100%', textAlign: 'left', background: '#fff', borderRadius: 12, padding: 14, marginTop: 8,
              border: '1px dashed #C8C4BC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <Layers size={16} color="#7A7570" style={{ flexShrink: 0 }} />
            {usablePacks.length > 0 ? (
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>
                  {usablePacks.reduce((n, p) => n + p.creditsRemaining, 0)} séance{usablePacks.reduce((n, p) => n + p.creditsRemaining, 0) > 1 ? 's' : ''} de pack disponible{usablePacks.reduce((n, p) => n + p.creditsRemaining, 0) > 1 ? 's' : ''}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: '#7A7570', marginTop: 2 }}>
                  {usablePacks[0]!.packSnapshot.name} · jusqu&apos;au {format(usablePacks[0]!.expiresAt.toDate(), 'd MMMM yyyy', { locale: fr })}
                </span>
              </span>
            ) : (
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>Packs de séances — en acheter un</span>
            )}
            <ChevronRight size={16} color="#A09890" style={{ flexShrink: 0 }} />
          </button>
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
          {myEnrollments.map((enrollment) => {
            const date = format(enrollment.startAt, 'd MMM yyyy · HH:mm', { locale: fr })
            return (
              <button
                key={enrollment.id}
                onClick={() => router.push(`/group-sessions/${enrollment.id}` as never)}
                style={{
                  background: '#fff', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0 }}>{enrollment.title}</p>
                    <p style={{ fontSize: 12, color: '#A09890', margin: '2px 0 0' }}>
                      {date}{enrollment.privateGroupName ? ` · ${enrollment.privateGroupName}` : ''}
                    </p>
                    <p style={{ fontSize: 12, color: '#7A7570', margin: '2px 0 0', fontFamily: 'monospace' }}>
                      {enrollment.originalAmountDue !== undefined && (
                        <span style={{ textDecoration: 'line-through', color: '#A09890', marginRight: 4 }}>
                          {enrollment.originalAmountDue.toFixed(2)} CHF
                        </span>
                      )}
                      {enrollment.viaPack ? 'Pack' : `${enrollment.amountDue.toFixed(2)} CHF`}
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
