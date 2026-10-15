'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Phone, Mail, MapPin, CreditCard, Repeat, X, Layers, Gift } from 'lucide-react'
import { hasReferralFreeSession } from '@/lib/utils/referral'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import {
  findActiveSubscriptionForClient, activateClientSubscriptionManually, cancelClientSubscription,
} from '@/lib/services/subscription.service'
import { SUBSCRIPTION_DURATION_UNIT_LABELS, DAY_OF_WEEK_LABELS } from '@/types'
import type { Client, Session, GroupSession, Service, SubscriptionPlan, ClientSubscription, PaymentStatus, PackPlan, ClientPack } from '@/types'
import { findClientPacks, assignPackManually, markPackPaid, cancelClientPack, packStateLabel } from '@/lib/services/pack.service'

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

// Ligne commune aux séances individuelles (`sessions`) et aux séances collectives (`groupSessions`,
// publiques ou de groupe privé) auxquelles le client est inscrit.
interface ClientSessionRow {
  key: string
  href: string
  date: Date
  title: string
  subtitle?: string
  paymentStatus: string
  amountDue?: number
  amountPaid?: number
  done: boolean
}

export default function ClientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'done' | 'planned'>('done')

  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services])
  const { data: plans } = useCollection<SubscriptionPlan>('subscriptionPlans', [])
  const assignablePlans = useMemo(() => plans.filter(p => p.active), [plans])

  const { user } = useAuth()
  const isAdmin = user?.roles?.includes('admin') ?? false

  // Filleuls de ce client (admin uniquement : la requête n'est pas filtrée par coach)
  const [filleuls, setFilleuls] = useState<Client[]>([])
  useEffect(() => {
    if (!clientId || !isAdmin) return
    getDocs(query(collection(db, 'clients'), where('referredByClientId', '==', clientId)))
      .then(snap => setFilleuls(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client))))
      .catch(() => {})
  }, [clientId, isAdmin])

  // Packs de séances du client (hors achats en ligne non payés)
  const { data: packPlans } = useCollection<PackPlan>('packPlans', [])
  const assignablePackPlans = useMemo(() => packPlans.filter(p => p.active), [packPlans])
  const [packs, setPacks] = useState<ClientPack[]>([])
  const [showPackSheet, setShowPackSheet] = useState(false)
  const [packPlanId, setPackPlanId] = useState('')
  const [packPaymentStatus, setPackPaymentStatus] = useState<PaymentStatus>('paid')
  const [packSaving, setPackSaving] = useState(false)
  const [packError, setPackError] = useState('')
  const reloadPacks = useCallback(() => {
    if (!clientId) return
    findClientPacks(clientId).then(list => setPacks([...list].reverse())).catch(() => {})
  }, [clientId])
  useEffect(() => { reloadPacks() }, [reloadPacks])

  async function handleAssignPack() {
    const plan = assignablePackPlans.find(p => p.id === packPlanId)
    if (!plan || !user) { setPackError('Choisis un pack.'); return }
    setPackSaving(true); setPackError('')
    try {
      await assignPackManually({ clientId, plan, paymentStatus: packPaymentStatus, createdBy: user.id })
      setShowPackSheet(false)
      reloadPacks()
    } catch (err) {
      setPackError(err instanceof Error ? err.message : "Erreur lors de l'attribution.")
    } finally {
      setPackSaving(false)
    }
  }
  const [activeSubscription, setActiveSubscription] = useState<ClientSubscription | null>(null)
  const [subLoading, setSubLoading] = useState(true)
  const [showAssignSheet, setShowAssignSheet] = useState(false)
  const [assignPlanId, setAssignPlanId] = useState('')
  const [assignPaymentStatus, setAssignPaymentStatus] = useState<PaymentStatus>('paid')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState('')

  const reloadSubscription = useCallback(() => {
    if (!clientId) return
    setSubLoading(true)
    findActiveSubscriptionForClient(clientId)
      .then(setActiveSubscription)
      .finally(() => setSubLoading(false))
  }, [clientId])

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
    // Séances collectives (publiques ou privées) où le client a une inscription active
    getDocs(query(collection(db, 'groupSessions'), where('enrolledClientIds', 'array-contains', clientId)))
      .then(snap => setGroupSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupSession))))
      .catch(() => {})
    reloadSubscription()
  }, [clientId, reloadSubscription])

  function openAssignSheet() {
    setAssignPlanId(assignablePlans[0]?.id ?? '')
    setAssignPaymentStatus('paid')
    setAssignError('')
    setShowAssignSheet(true)
  }

  async function handleAssign() {
    const plan = assignablePlans.find(p => p.id === assignPlanId)
    if (!plan || !user) { setAssignError('Choisis un plan.'); return }
    setAssigning(true); setAssignError('')
    try {
      await activateClientSubscriptionManually({
        clientId,
        plan,
        paymentStatus: assignPaymentStatus,
        amountPaid: assignPaymentStatus === 'paid' || assignPaymentStatus === 'credits' ? plan.price : 0,
        createdBy: user.id,
      })
      setShowAssignSheet(false)
      reloadSubscription()
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Erreur lors de l\'attribution.')
    } finally {
      setAssigning(false)
    }
  }

  async function handleCancelSubscription() {
    if (!activeSubscription) return
    if (!confirm('Annuler l\'abonnement actif de ce client ?')) return
    await cancelClientSubscription(activeSubscription.id, clientId)
    reloadSubscription()
  }

  const rows = useMemo((): ClientSessionRow[] => {
    const fromSessions = sessions
      .filter(s => s.status === 'done' || s.status === 'planned')
      .map(s => {
        const dist = s.paymentDistribution?.find(p => p.clientId === clientId)
        return {
          key: `s-${s.id}`, href: `/sessions/${s.id}`, date: s.startAt?.toDate?.() ?? new Date(),
          title: serviceMap.get(s.serviceId)?.name ?? s.priceSnapshot?.serviceName ?? '—',
          paymentStatus: dist?.paymentStatus ?? s.paymentStatus,
          amountDue: dist?.amountDue, amountPaid: dist?.amountPaid,
          done: s.status === 'done',
        }
      })
    // Une séance collective n'est jamais "clôturée" : elle compte comme effectuée une fois commencée
    const now = Date.now()
    const fromGroupSessions = groupSessions
      .filter(gs => gs.status !== 'cancelled')
      .flatMap(gs => {
        const enrollment = gs.enrollments.find(e => e.clientId === clientId && e.status !== 'cancelled')
        if (!enrollment) return []
        const date = gs.startAt?.toDate?.() ?? new Date()
        return [{
          key: `g-${gs.id}`, href: `/manage-group-sessions/${gs.id}`, date,
          title: gs.title,
          subtitle: gs.privateGroupName ? `Groupe privé · ${gs.privateGroupName}` : 'Séance collective',
          paymentStatus: enrollment.paymentStatus,
          amountDue: enrollment.amountDue, amountPaid: enrollment.amountPaid,
          done: date.getTime() <= now,
        }]
      })
    return [...fromSessions, ...fromGroupSessions].sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [sessions, groupSessions, clientId, serviceMap])

  const doneSessions = useMemo(() => rows.filter(r => r.done), [rows])
  // À venir : la plus proche en premier
  const plannedSessions = useMemo(() => rows.filter(r => !r.done).reverse(), [rows])

  const totalDue = useMemo(() => doneSessions.reduce((sum, r) => sum + (r.amountDue ?? 0), 0), [doneSessions])
  const totalPaid = useMemo(() => doneSessions.reduce((sum, r) => sum + (r.amountPaid ?? 0), 0), [doneSessions])

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

        {/* Parrainage */}
        {(client.referredByClientId || filleuls.length > 0) && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Gift size={14} color="#A09890" />
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Parrainage</p>
            </div>
            {client.referredByClientId && (
              <p style={{ margin: 0, fontSize: 14, color: '#1A1A18' }}>
                Parrainé par{' '}
                <button onClick={() => router.push(`/clients/${client.referredByClientId}` as never)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1A1A18', textDecoration: 'underline' }}>
                  {client.referredByName || 'un client'}
                </button>
                <span style={{ fontSize: 12, color: hasReferralFreeSession(client) ? '#2D7A4F' : '#7A7570' }}>
                  {' · '}{hasReferralFreeSession(client) ? 'séance offerte disponible' : 'séance offerte utilisée'}
                </span>
              </p>
            )}
            {filleuls.length > 0 && (
              <p style={{ margin: client.referredByClientId ? '6px 0 0' : 0, fontSize: 14, color: '#1A1A18' }}>
                {filleuls.length} filleul{filleuls.length > 1 ? 's' : ''} :{' '}
                {filleuls.map((f, i) => (
                  <span key={f.id}>
                    {i > 0 && ', '}
                    <button onClick={() => router.push(`/clients/${f.id}` as never)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, color: '#1A1A18', textDecoration: 'underline' }}>
                      {f.firstName} {f.lastName}
                    </button>
                    {f.referralRewardedAt && <span style={{ fontSize: 12, color: '#2D7A4F' }}> (récompensé)</span>}
                  </span>
                ))}
              </p>
            )}
          </div>
        )}

        {/* Abonnement */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: activeSubscription || !subLoading ? 8 : 0 }}>
            <Repeat size={14} color="#A09890" />
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Abonnement</p>
          </div>
          {subLoading ? (
            <p style={{ margin: 0, fontSize: 13, color: '#A09890' }}>Chargement…</p>
          ) : activeSubscription ? (
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A18' }}>{activeSubscription.planSnapshot.name}</p>
              <p style={{ margin: '2px 0 8px', fontSize: 12, color: '#7A7570' }}>
                Actif jusqu'au {format(activeSubscription.endAt.toDate(), 'd MMMM yyyy', { locale: fr })} · {activeSubscription.planSnapshot.sessionsPerWeek}x/semaine
                {activeSubscription.planSnapshot.fixedSlot && ` · ${DAY_OF_WEEK_LABELS[activeSubscription.planSnapshot.fixedSlot.dayOfWeek]} ${activeSubscription.planSnapshot.fixedSlot.startTime}`}
              </p>
              <button onClick={handleCancelSubscription}
                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: '#FDECEA', color: '#C0392B' }}>
                Annuler l'abonnement
              </button>
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#A09890' }}>Aucun abonnement actif.</p>
              <button onClick={openAssignSheet} disabled={assignablePlans.length === 0}
                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: assignablePlans.length === 0 ? 'default' : 'pointer', fontSize: 12, fontWeight: 500, background: '#1A1A18', color: '#fff', opacity: assignablePlans.length === 0 ? 0.4 : 1 }}>
                Attribuer un abonnement
              </button>
            </div>
          )}
        </div>

        {/* Packs de séances */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Layers size={14} color="#A09890" />
            <p style={{ flex: 1, margin: 0, fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Packs de séances</p>
            {isAdmin && (
              <button
                onClick={() => { setPackPlanId(assignablePackPlans[0]?.id ?? ''); setPackPaymentStatus('paid'); setPackError(''); setShowPackSheet(true) }}
                disabled={assignablePackPlans.length === 0}
                style={{ padding: '4px 10px', borderRadius: 8, border: 'none', cursor: assignablePackPlans.length === 0 ? 'default' : 'pointer', fontSize: 12, fontWeight: 500, background: '#1A1A18', color: '#fff', opacity: assignablePackPlans.length === 0 ? 0.4 : 1 }}>
                Attribuer
              </button>
            )}
          </div>
          {packs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: '#A09890' }}>Aucun pack.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {packs.map(pack => {
                const state = packStateLabel(pack)
                const toCollect = pack.paymentStatus !== 'paid' && pack.paymentStatus !== 'offered'
                return (
                  <div key={pack.id} style={{ borderTop: '1px solid #F5F3F0', paddingTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A18' }}>{pack.packSnapshot.name}</p>
                      <span style={{ fontSize: 11, fontWeight: 600, color: state.color, background: `${state.color}18`, padding: '2px 6px', borderRadius: 5, flexShrink: 0 }}>{state.label}</span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A7570' }}>
                      {pack.creditsRemaining}/{pack.creditsTotal} séances restantes · expire le {format(pack.expiresAt.toDate(), 'd MMM yyyy', { locale: fr })}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: toCollect ? '#F59E0B' : '#A09890' }}>
                      CHF {pack.amountDue.toFixed(2)} · {PAYMENT_STATUS_LABELS[pack.paymentStatus] ?? pack.paymentStatus}
                      {' · '}{pack.source === 'self_purchase' ? 'acheté en ligne' : 'attribué'} le {format(pack.purchasedAt.toDate(), 'd MMM yyyy', { locale: fr })}
                    </p>
                    {isAdmin && pack.status === 'active' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        {toCollect && (
                          <button onClick={() => markPackPaid(pack).then(reloadPacks)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: '#E8F3EE', color: '#2D7A4F' }}>
                            ✓ Payé
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm('Annuler ce pack ? Ses séances restantes ne seront plus utilisables.')) cancelClientPack(pack.id).then(reloadPacks) }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: '#FDECEA', color: '#C0392B' }}>
                          Annuler le pack
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
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
          {displayedSessions.map((row, i) => {
            const sessionDate = row.date
            const status = row.paymentStatus

            return (
              <button key={row.key} onClick={() => router.push(row.href as never)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', width: '100%', background: 'none', border: 'none', borderTop: i > 0 ? '1px solid #F5F3F0' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A1A18', lineHeight: 1 }}>{format(sessionDate, 'd')}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#A09890', textTransform: 'uppercase' }}>{format(sessionDate, 'MMM', { locale: fr })}</p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A1A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.title}
                    </p>
                    {tab === 'done' && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: PAYMENT_STATUS_COLORS[status] ?? '#A09890', background: `${PAYMENT_STATUS_COLORS[status]}18`, padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {PAYMENT_STATUS_LABELS[status] ?? status}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7A7570' }}>
                    {format(sessionDate, 'HH:mm')}
                    {row.subtitle && ` · ${row.subtitle}`}
                    {tab === 'done' && row.amountDue !== undefined && ` · CHF ${(row.amountPaid ?? 0).toFixed(0)}/${row.amountDue.toFixed(0)}`}
                  </p>
                </div>
                <ChevronRight size={14} color="#C8C4BC" />
              </button>
            )
          })}
        </div>
      </div>

      {showPackSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={() => setShowPackSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'relative', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', maxHeight: '85dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1A1A18', margin: 0 }}>Attribuer un pack</p>
              <button onClick={() => setShowPackSheet(false)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570' }}><X size={20} /></button>
            </div>

            <p style={{ fontSize: 12, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Pack</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {assignablePackPlans.map(plan => (
                <button key={plan.id} onClick={() => setPackPlanId(plan.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${packPlanId === plan.id ? '#1A1A18' : '#E5E1DA'}`, background: packPlanId === plan.id ? '#F5F3F0' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A18' }}>{plan.name}</span>
                  <span style={{ fontSize: 12, color: '#7A7570' }}>
                    CHF {plan.price.toFixed(2)} · {plan.sessionCount} séances · valable {plan.validityValue} {SUBSCRIPTION_DURATION_UNIT_LABELS[plan.validityUnit]}{plan.isPublic ? '' : ' · caché'}
                  </span>
                </button>
              ))}
            </div>

            <p style={{ fontSize: 12, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Statut du paiement</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {(['paid', 'payment_to_request', 'offered'] as PaymentStatus[]).map(status => (
                <button key={status} onClick={() => setPackPaymentStatus(status)}
                  style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: packPaymentStatus === status ? '#1A1A18' : '#F0EDE8', color: packPaymentStatus === status ? '#fff' : '#1A1A18' }}>
                  {PAYMENT_STATUS_LABELS[status]}
                </button>
              ))}
            </div>

            {packError && <p style={{ fontSize: 13, color: '#C0392B', margin: '0 0 12px' }}>{packError}</p>}
            <button onClick={handleAssignPack} disabled={packSaving}
              style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#1A1A18', color: '#fff', fontSize: 14, fontWeight: 600, opacity: packSaving ? 0.6 : 1 }}>
              {packSaving ? 'Attribution…' : 'Attribuer le pack'}
            </button>
          </div>
        </div>
      )}

      {showAssignSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={() => setShowAssignSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'relative', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', maxHeight: '85dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1A1A18', margin: 0 }}>Attribuer un abonnement</p>
              <button onClick={() => setShowAssignSheet(false)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570' }}><X size={20} /></button>
            </div>

            <p style={{ fontSize: 12, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Plan</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {assignablePlans.map(plan => (
                <button key={plan.id} onClick={() => setAssignPlanId(plan.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${assignPlanId === plan.id ? '#1A1A18' : '#E5E1DA'}`, background: assignPlanId === plan.id ? '#F5F3F0' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A18' }}>{plan.name}</span>
                  <span style={{ fontSize: 12, color: '#7A7570' }}>
                    CHF {plan.price.toFixed(2)} · {plan.durationValue} {SUBSCRIPTION_DURATION_UNIT_LABELS[plan.durationUnit]} · {plan.sessionsPerWeek}x/semaine
                    {plan.fixedSlot && ` · ${DAY_OF_WEEK_LABELS[plan.fixedSlot.dayOfWeek]} ${plan.fixedSlot.startTime}`}
                  </span>
                </button>
              ))}
            </div>

            <p style={{ fontSize: 12, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Statut du paiement</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {(['paid', 'payment_to_request', 'offered', 'credits'] as PaymentStatus[]).map(status => (
                <button key={status} onClick={() => setAssignPaymentStatus(status)}
                  style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: assignPaymentStatus === status ? '#1A1A18' : '#F0EDE8', color: assignPaymentStatus === status ? '#fff' : '#1A1A18' }}>
                  {PAYMENT_STATUS_LABELS[status]}
                </button>
              ))}
            </div>

            {assignError && <p style={{ fontSize: 13, color: '#C0392B', margin: '0 0 12px' }}>{assignError}</p>}
            <button onClick={handleAssign} disabled={assigning || !assignPlanId}
              style={{ width: '100%', height: 46, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#1A1A18', color: '#fff', fontSize: 14, fontWeight: 600, opacity: assigning || !assignPlanId ? 0.6 : 1 }}>
              {assigning ? 'Attribution…' : 'Attribuer'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
