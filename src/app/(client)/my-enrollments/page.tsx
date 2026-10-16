'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ticket, Repeat, Layers } from 'lucide-react'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { findActiveSubscriptionForClient } from '@/lib/services/subscription.service'
import { fetchMyPrivateGroupSessions } from '@/lib/services/group-session.service'
import { findClientPacks, isPackUsable } from '@/lib/services/pack.service'
import { DAY_OF_WEEK_LABELS } from '@/types'
import type { GroupSession, GroupSessionEnrollmentStatus, ClientSubscription, PrivateSessionView, ClientPack } from '@/types'
import { AuthGuard } from '@/components/providers/AuthGuard'
import { BrandLoader } from '@/components/shared/BrandLoader'
import { ClientPage, SectionTitle, EmptyCard } from '@/components/client/ClientPage'
import { C, card, primaryButton, secondaryButton, DateBox, Pill } from '@/components/client/ClientUI'

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

export default function MyEnrollmentsPage() {
  return (
    <AuthGuard requireClient>
      <MyEnrollmentsContent />
    </AuthGuard>
  )
}

function MyEnrollmentsContent() {
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
      // Après une désinscription puis réinscription, la séance contient plusieurs inscriptions du
      // client : on affiche l'active, à défaut la plus récente (annulée).
      const mine = gs.enrollments.filter(e => e.clientId === profile.clientId)
      const enrollment = mine.find(e => e.status !== 'cancelled') ?? mine[mine.length - 1]
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

  const now = Date.now()
  const upcoming = myEnrollments
    .filter(e => e.status !== 'cancelled' && e.startAt.getTime() >= now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  const history = myEnrollments.filter(e => !upcoming.includes(e))
  const packCredits = usablePacks.reduce((n, p) => n + p.creditsRemaining, 0)

  return (
    <ClientPage title="Mes inscriptions" back backFallback="/profile">
      {!subLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Link href="/subscriptions" className="press-effect" style={{
            ...tile, ...(activeSubscription ? { background: C.graphite, color: '#fff' } : {}),
          }}>
            <span style={{ ...tileLabel, color: activeSubscription ? 'rgba(255,255,255,0.65)' : C.muted }}><Repeat size={13} strokeWidth={2} />Abonnement</span>
            {activeSubscription ? (
              <>
                <span style={tileValue}>{activeSubscription.planSnapshot.name}</span>
                <span style={{ ...tileSub, color: 'rgba(255,255,255,0.65)' }}>
                  {activeSubscription.planSnapshot.sessionsPerWeek}x/sem. · jusqu&apos;au {format(activeSubscription.endAt.toDate(), 'd MMM', { locale: fr })}
                  {activeSubscription.planSnapshot.fixedSlot && ` · ${DAY_OF_WEEK_LABELS[activeSubscription.planSnapshot.fixedSlot.dayOfWeek]} ${activeSubscription.planSnapshot.fixedSlot.startTime}`}
                </span>
              </>
            ) : (
              <>
                <span style={tileValue}>Aucun</span>
                <span style={tileSub}>En prendre un →</span>
              </>
            )}
          </Link>
          <Link href="/packs" className="press-effect" style={tile}>
            <span style={tileLabel}><Layers size={13} strokeWidth={2} />Packs</span>
            {packCredits > 0 ? (
              <>
                <span style={tileValue}>{packCredits} séance{packCredits > 1 ? 's' : ''}</span>
                <span style={tileSub}>jusqu&apos;au {format(usablePacks[0]!.expiresAt.toDate(), 'd MMM yyyy', { locale: fr })}</span>
              </>
            ) : (
              <>
                <span style={tileValue}>Aucun</span>
                <span style={tileSub}>En acheter un →</span>
              </>
            )}
          </Link>
        </div>
      )}

      {loading || profileLoading ? (
        <BrandLoader />
      ) : myEnrollments.length === 0 ? (
        <EmptyCard
          icon={<Ticket size={18} strokeWidth={1.75} />}
          title="Aucune réservation"
          text="Réserve ta première séance depuis le planning."
          action={<Link href="/group-sessions" style={{ ...primaryButton, padding: '0 22px' }}>Voir le planning</Link>}
        />
      ) : (
        <>
          <SectionTitle aside={upcoming.length > 0 ? `${upcoming.length}` : undefined}>À venir</SectionTitle>
          {upcoming.length === 0 ? (
            <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14, color: C.muted }}>Aucune séance réservée</span>
              <Link href="/group-sessions" style={{ ...secondaryButton, height: 38, padding: '0 16px' }}>Réserver</Link>
            </div>
          ) : (
            <div style={{ ...card, padding: '6px 18px' }}>
              {upcoming.map((e, idx) => <EnrollmentRow key={e.id} item={e} divider={idx > 0} />)}
            </div>
          )}

          {history.length > 0 && (
            <>
              <SectionTitle>Historique</SectionTitle>
              <div style={{ ...card, padding: '6px 18px' }}>
                {history.map((e, idx) => <EnrollmentRow key={e.id} item={e} divider={idx > 0} past />)}
              </div>
            </>
          )}
        </>
      )}
    </ClientPage>
  )
}

function EnrollmentRow({ item, divider, past }: { item: MyEnrollmentItem; divider: boolean; past?: boolean }) {
  const cancelled = item.status === 'cancelled'
  const price = item.viaPack ? 'Pack'
    : item.amountDue === 0 ? (item.originalAmountDue !== undefined ? 'Offert' : 'Gratuit')
    : `${Number.isInteger(item.amountDue) ? item.amountDue : item.amountDue.toFixed(2)} CHF`
  return (
    <Link
      href={`/group-sessions/${item.id}` as never}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', color: C.ink, textDecoration: 'none',
        borderTop: divider ? `1px solid ${C.line}` : undefined,
      }}
    >
      <div style={{ opacity: past ? 0.55 : 1 }}>
        <DateBox date={item.startAt} dark={!past && item.status === 'confirmed'} />
      </div>
      <div style={{ flex: 1, minWidth: 0, color: past ? '#9A9A96' : C.ink }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{format(item.startAt, 'HH:mm')} · {item.title}</p>
        <p style={{ margin: '1px 0 0', fontSize: 13, color: past ? '#AFAFAB' : C.muted }}>
          {format(item.startAt, 'd MMMM yyyy', { locale: fr })}{item.privateGroupName ? ` · ${item.privateGroupName}` : ''}
        </p>
        <div style={{ marginTop: 6 }}>
          {cancelled ? <Pill tone="red">Annulée</Pill>
            : past ? <Pill tone="neutral">Terminée</Pill>
            : item.status === 'confirmed' ? <Pill tone="green">Confirmée</Pill>
            : <Pill tone="amber">Paiement en attente</Pill>}
        </div>
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, flexShrink: 0, color: past ? '#AFAFAB' : C.ink }}>{price}</span>
    </Link>
  )
}

const tile: React.CSSProperties = {
  ...card, padding: 16, background: C.stone, color: C.ink, textDecoration: 'none',
  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
}
const tileLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: C.muted, marginBottom: 4 }
const tileValue: React.CSSProperties = { fontSize: 17, fontWeight: 600, lineHeight: 1.25 }
const tileSub: React.CSSProperties = { fontSize: 12, color: C.muted, lineHeight: 1.35 }
