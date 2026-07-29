'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, X, Pencil, UserPlus } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { db } from '@/lib/firebase/firestore'
import { adminCancelGroupSessionEnrollment, adminAddGuestToGroupSession } from '@/lib/services/group-session.service'
import { GROUP_SESSION_LEVEL_LABELS, type GroupSession, type Client, type GroupSessionEnrollmentStatus } from '@/types'

const ENROLLMENT_BADGE_VARIANT: Record<GroupSessionEnrollmentStatus, 'payment_to_request' | 'paid' | 'cancelled'> = {
  pending_payment: 'payment_to_request',
  confirmed: 'paid',
  cancelled: 'cancelled',
}

const ENROLLMENT_LABEL: Record<GroupSessionEnrollmentStatus, string> = {
  pending_payment: 'À payer',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
}

type GuestPaymentStatus = 'paid' | 'offered' | 'payment_to_request'

const GUEST_PAYMENT_OPTIONS: { value: GuestPaymentStatus; label: string }[] = [
  { value: 'paid', label: 'Payé' },
  { value: 'offered', label: 'Offert' },
  { value: 'payment_to_request', label: 'À encaisser' },
]

export default function GroupSessionDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [groupSession, setGroupSession] = useState<GroupSession | null>(null)
  const [clients, setClients] = useState<Record<string, Client>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const [showAddGuest, setShowAddGuest] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestPaymentStatus, setGuestPaymentStatus] = useState<GuestPaymentStatus>('paid')
  const [guestAmount, setGuestAmount] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)
  const [guestError, setGuestError] = useState<string | null>(null)

  useEffect(() => {
    return onSnapshot(doc(db, 'groupSessions', params.id), snap => {
      setGroupSession(snap.exists() ? ({ id: snap.id, ...snap.data() } as GroupSession) : null)
      setLoading(false)
    }, () => setLoading(false))
  }, [params.id])

  useEffect(() => {
    if (!groupSession || groupSession.enrollments.length === 0) return
    const clientIds = groupSession.enrollments.map(e => e.clientId).filter((id): id is string => !!id)
    if (clientIds.length === 0) return
    getDocs(query(collection(db, 'clients'), where('__name__', 'in', clientIds.slice(0, 10))))
      .then(snap => {
        const map: Record<string, Client> = {}
        snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as Client })
        setClients(map)
      })
      .catch(() => {})
  }, [groupSession])

  async function togglePublic() {
    if (!groupSession || saving) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'groupSessions', groupSession.id), {
        isPublic: !groupSession.isPublic,
        updatedAt: serverTimestamp(),
      })
    } finally {
      setSaving(false)
    }
  }

  async function cancelEnrollment(target: { clientId?: string; enrollmentId?: string }, alreadyPaid: boolean) {
    if (cancellingId) return
    const warning = alreadyPaid
      ? 'Ce participant a déjà payé — aucun remboursement automatique ne sera déclenché. Annuler quand même son inscription ?'
      : 'Annuler l\'inscription de ce participant ?'
    if (!confirm(warning)) return
    const id = target.clientId ?? target.enrollmentId!
    setCancellingId(id)
    try {
      await adminCancelGroupSessionEnrollment(params.id, target)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setCancellingId(null)
    }
  }

  function openAddGuest() {
    setGuestName(''); setGuestPaymentStatus('paid')
    setGuestAmount(groupSession ? String(groupSession.price) : '')
    setGuestError(null)
    setShowAddGuest(true)
  }

  async function handleAddGuest() {
    if (!guestName.trim()) { setGuestError('Le nom est requis.'); return }
    setAddingGuest(true); setGuestError(null)
    try {
      await adminAddGuestToGroupSession(params.id, {
        guestName: guestName.trim(),
        paymentStatus: guestPaymentStatus,
        ...(guestPaymentStatus === 'paid' ? { amountPaid: parseFloat(guestAmount) || 0 } : {}),
      })
      setShowAddGuest(false)
    } catch (err) {
      setGuestError((err as Error).message)
    } finally {
      setAddingGuest(false)
    }
  }

  async function cancelSession() {
    if (!groupSession || saving) return
    if (!confirm('Annuler cette séance collective ? Les clients inscrits ne pourront plus la voir.')) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'groupSessions', groupSession.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
      </div>
    )
  }

  if (!groupSession) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#A09890', fontSize: 14 }}>Séance introuvable.</p>
      </div>
    )
  }

  const confirmedCount = groupSession.enrollments.filter(e => e.status !== 'cancelled').length
  const isFull = confirmedCount >= groupSession.maxParticipants
  const date = groupSession.startAt?.toDate ? format(groupSession.startAt.toDate(), 'EEEE d MMMM yyyy · HH:mm', { locale: fr }) : '—'

  return (
    <>
      <TopBar
        title={groupSession.title}
        left={
          <button onClick={() => router.push('/manage-group-sessions' as never)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={20} color="#1A1A18" />
          </button>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 80px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 13, color: '#7A7570', margin: 0, textTransform: 'capitalize' }}>{date}</p>
            {groupSession.recurrenceId && <Badge variant="muted">Récurrente</Badge>}
            {groupSession.level && <Badge variant="muted">{GROUP_SESSION_LEVEL_LABELS[groupSession.level]}</Badge>}
          </div>
          {groupSession.description && (
            <p style={{ fontSize: 14, color: '#1A1A18', margin: '8px 0 0' }}>{groupSession.description}</p>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div>
              <p style={{ fontSize: 11, color: '#A09890', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Places</p>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: '2px 0 0', fontFamily: 'monospace' }}>
                {confirmedCount}/{groupSession.maxParticipants}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#A09890', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prix</p>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: '2px 0 0', fontFamily: 'monospace' }}>
                {groupSession.price.toFixed(2)} CHF
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#A09890', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Statut</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Badge variant={groupSession.status === 'cancelled' ? 'cancelled' : groupSession.isPublic ? 'paid' : 'muted'}>
                  {groupSession.status === 'cancelled' ? 'Annulée' : groupSession.isPublic ? 'Publiée' : 'Non publiée'}
                </Badge>
                {groupSession.status === 'planned' && (
                  <button onClick={() => router.push(`/manage-group-sessions/${groupSession.id}/edit` as never)} style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}>
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Inscrits ({confirmedCount})
            </p>
            {groupSession.status === 'planned' && (
              <button
                onClick={openAddGuest}
                disabled={isFull}
                title={isFull ? 'Séance complète' : 'Ajouter un invité'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                  cursor: isFull ? 'not-allowed' : 'pointer', color: isFull ? '#C8C4BC' : '#1A1A18',
                  fontSize: 12, fontWeight: 600, padding: 0,
                }}
              >
                <UserPlus size={14} /> Ajouter
              </button>
            )}
          </div>
          {groupSession.enrollments.length === 0 ? (
            <p style={{ fontSize: 13, color: '#A09890', margin: 0 }}>Aucune inscription pour l&apos;instant.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupSession.enrollments.map(e => {
                const client = e.clientId ? clients[e.clientId] : undefined
                const displayName = client ? `${client.firstName} ${client.lastName}` : e.guestName ?? e.clientId ?? '—'
                const key = e.id ?? e.clientId ?? displayName
                const cancelTarget = e.clientId ? { clientId: e.clientId } : { enrollmentId: e.id }
                const isCancelling = cancellingId === (e.clientId ?? e.id)
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: 14, color: '#1A1A18', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {displayName}
                      {!e.clientId && <Badge variant="muted">Invité</Badge>}
                      {e.classPassBookingId && <Badge variant="muted">ClassPass</Badge>}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Badge variant={ENROLLMENT_BADGE_VARIANT[e.status]}>{ENROLLMENT_LABEL[e.status]}</Badge>
                      {e.status !== 'cancelled' && (
                        <button
                          onClick={() => cancelEnrollment(cancelTarget, e.paymentStatus === 'paid')}
                          disabled={isCancelling}
                          title="Annuler cette inscription"
                          style={{
                            width: 24, height: 24, borderRadius: 6, border: 'none', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: '#FDECEA', cursor: isCancelling ? 'default' : 'pointer', opacity: isCancelling ? 0.5 : 1,
                          }}
                        >
                          <X size={13} color="#C0392B" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {groupSession.status !== 'cancelled' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={togglePublic}
              disabled={saving}
              style={{
                flex: 1, height: 40, borderRadius: 8, border: '1px solid #E5E1DA', cursor: 'pointer',
                background: '#fff', color: '#1A1A18', fontSize: 13, fontWeight: 500,
              }}
            >
              {groupSession.isPublic ? 'Dépublier' : 'Publier'}
            </button>
            <button
              onClick={cancelSession}
              disabled={saving}
              style={{
                flex: 1, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#FDECEA', color: '#C0392B', fontSize: 13, fontWeight: 500,
              }}
            >
              Annuler la séance
            </button>
          </div>
        )}
      </div>

      {showAddGuest && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddGuest(false)} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">Ajouter un invité</h2>
              <button onClick={() => setShowAddGuest(false)} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <p className="text-[12px] text-[var(--color-text-tertiary)] -mt-2">
              Pour une personne de passage — aucune fiche client n&apos;est créée.
            </p>

            <FormField label="Nom" required>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Prénom Nom" autoFocus />
            </FormField>

            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">Paiement</p>
              <div className="flex gap-2">
                {GUEST_PAYMENT_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setGuestPaymentStatus(opt.value)}
                    className="flex-1 py-2 rounded-[var(--radius-md)] border text-[13px] font-medium"
                    style={{ background: guestPaymentStatus === opt.value ? '#1A1A18' : 'var(--color-surface)', color: guestPaymentStatus === opt.value ? '#fff' : 'var(--color-text-primary)', borderColor: guestPaymentStatus === opt.value ? '#1A1A18' : 'var(--color-border)' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {guestPaymentStatus === 'paid' && (
              <FormField label="Montant encaissé (CHF)">
                <Input type="number" min="0" step="0.5" value={guestAmount} onChange={(e) => setGuestAmount(e.target.value)} />
              </FormField>
            )}

            {guestError && <p className="text-[13px] text-[var(--color-danger)]">{guestError}</p>}
            <Button size="lg" className="w-full" onClick={handleAddGuest} loading={addingGuest}>
              Ajouter à la séance
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
