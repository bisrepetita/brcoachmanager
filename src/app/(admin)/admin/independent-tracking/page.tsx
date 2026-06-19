'use client'

import { useState, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { orderBy, where, doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { Check, ChevronRight, X, Gift, Banknote } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIndependentSessions } from '@/lib/hooks/useIndependentSessions'
import { db } from '@/lib/firebase/firestore'
import type { User, Session, RoomRentalPayment } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function updateRentalEntry(
  sessionId: string,
  coachId: string,
  patch: Partial<{ status: 'pending' | 'paid' | 'waived'; paidAt: ReturnType<typeof serverTimestamp> }>
) {
  const ref = doc(db, 'sessions', sessionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const session = snap.data() as Session
  const updated = (session.roomRentalSnapshot ?? []).map(e =>
    e.coachId === coachId ? { ...e, ...patch } : e
  )
  await updateDoc(ref, { roomRentalSnapshot: updated })
}

// ─── Sheet versement global ───────────────────────────────────────────────────

function GlobalPaySheet({
  coachId,
  totalPending,
  pendingRows,
  onClose,
  userId,
}: {
  coachId: string
  totalPending: number
  pendingRows: ReturnType<typeof useIndependentSessions>['pending']
  onClose: () => void
  userId: string
}) {
  const [amount, setAmount] = useState(totalPending.toFixed(2))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handlePay = async () => {
    const paid = parseFloat(amount)
    if (!paid || paid <= 0) return
    setSaving(true)
    try {
      // Marquer les séances les plus anciennes en premier jusqu'à épuisement du montant
      const sorted = [...pendingRows].sort((a, b) =>
        a.session.startAt.toMillis() - b.session.startAt.toMillis()
      )
      let remaining = paid
      const applied: string[] = []
      const batch = writeBatch(db)

      for (const row of sorted) {
        if (remaining <= 0) break
        const due = row.entry.amountDueToCompany
        if (remaining >= due) {
          remaining -= due
          applied.push(row.session.id)
          const ref = doc(db, 'sessions', row.session.id)
          const snap = await getDoc(ref)
          if (snap.exists()) {
            const session = snap.data() as Session
            const updated = (session.roomRentalSnapshot ?? []).map(e =>
              e.coachId === coachId ? { ...e, status: 'paid', paidAt: serverTimestamp() } : e
            )
            batch.update(ref, { roomRentalSnapshot: updated })
          }
        }
      }

      // Enregistrer le versement
      await addDoc(collection(db, 'roomRentalPayments'), {
        coachId,
        amount: paid,
        note: note.trim() || null,
        appliedToSessionIds: applied,
        createdBy: userId,
        createdAt: serverTimestamp(),
      })

      await batch.commit()
      onClose()
    } catch (e) {
      console.error(e)
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Versement global</p>
          <button onClick={onClose} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570' }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 13, color: '#7A7570', margin: 0 }}>
          Les séances les plus anciennes seront soldées en premier.
        </p>
        <div>
          <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 4px' }}>Montant reçu (CHF)</p>
          <input
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ height: 44, border: '1px solid #E5E1DA', borderRadius: 8, padding: '0 12px', fontSize: 16, color: '#1A1A18', background: '#F9F8F6', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
          />
        </div>
        <div>
          <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 4px' }}>Note (optionnel)</p>
          <input
            type="text"
            placeholder="Ex. virement du 20 juin"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ height: 36, border: '1px solid #E5E1DA', borderRadius: 8, padding: '0 10px', fontSize: 14, color: '#1A1A18', background: '#F9F8F6', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={handlePay}
          disabled={saving}
          style={{ width: '100%', height: 48, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#1A1A18', color: '#fff', fontSize: 15, fontWeight: 600 }}
        >
          {saving ? 'Enregistrement…' : 'Confirmer le versement'}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IndependentTrackingPage() {
  const { user } = useAuth()
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null)
  const [showGlobalPay, setShowGlobalPay] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const { data: allCoaches } = useCollection<User>('users', [orderBy('firstName')])
  const coaches = useMemo(() => allCoaches.filter(c => c.active !== false), [allCoaches])

  const paymentConstraints = useMemo(() =>
    selectedCoachId
      ? [where('coachId', '==', selectedCoachId), orderBy('createdAt', 'desc')]
      : [],
    [selectedCoachId]
  )
  const { data: payments } = useCollection<RoomRentalPayment>('roomRentalPayments', paymentConstraints)

  const { pending, resolved, totalPending, loading } = useIndependentSessions(selectedCoachId)

  const handleMarkPaid = useCallback(async (sessionId: string) => {
    if (!selectedCoachId) return
    setActing(sessionId)
    await updateRentalEntry(sessionId, selectedCoachId, { status: 'paid', paidAt: serverTimestamp() as any })
    setActing(null)
  }, [selectedCoachId])

  const handleMarkWaived = useCallback(async (sessionId: string) => {
    if (!selectedCoachId) return
    setActing(sessionId)
    await updateRentalEntry(sessionId, selectedCoachId, { status: 'waived' })
    setActing(null)
  }, [selectedCoachId])

  const selectedCoach = coaches.find(c => c.id === selectedCoachId)

  return (
    <>
      <TopBar title="Suivi indépendants" />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9F8F6', minHeight: '100dvh' }}>

        {/* Sélecteur coach */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Coach</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {coaches.map(c => (
              <button key={c.id} onClick={() => setSelectedCoachId(c.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: selectedCoachId === c.id ? '#F0EDE8' : 'transparent', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color ?? '#A09890', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: '#1A1A18', fontWeight: selectedCoachId === c.id ? 500 : 400 }}>{c.firstName} {c.lastName}</span>
                </div>
                {selectedCoachId === c.id && <Check size={14} color="#1A1A18" />}
              </button>
            ))}
          </div>
        </div>

        {selectedCoachId && !loading && (
          <>
            {/* Résumé */}
            <div style={{ background: totalPending > 0 ? '#FDF6EA' : '#F0F9F4', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 2px' }}>En attente — {selectedCoach?.firstName}</p>
                <p style={{ fontSize: 26, fontWeight: 700, color: totalPending > 0 ? '#8A6200' : '#2D7A4F', margin: 0, fontFamily: 'monospace' }}>
                  {totalPending.toFixed(2)} CHF
                </p>
                <p style={{ fontSize: 12, color: '#A09890', margin: '2px 0 0' }}>
                  {pending.length} séance{pending.length !== 1 ? 's' : ''} en attente
                </p>
              </div>
              {totalPending > 0 && (
                <button
                  onClick={() => setShowGlobalPay(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 600 }}
                >
                  <Banknote size={14} />
                  Versement
                </button>
              )}
            </div>

            {/* Séances en attente */}
            {pending.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                  En attente de paiement
                </p>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pending.map(({ session, entry }, i) => {
                    const isActing = acting === session.id
                    return (
                      <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: i < pending.length - 1 ? '1px solid #F0EDE8' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>
                            {format(session.startAt.toDate(), 'd MMM yyyy', { locale: fr })}
                          </p>
                          <p style={{ fontSize: 13, color: '#7A7570', margin: '1px 0 0' }}>
                            {session.priceSnapshot.serviceName} · <span style={{ fontFamily: 'monospace' }}>{entry.amountDueToCompany.toFixed(2)} CHF</span>
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => handleMarkWaived(session.id)} disabled={!!isActing}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, backgroundColor: '#FDF6EA', color: '#8A6200', opacity: isActing ? 0.5 : 1 }}>
                            <Gift size={11} />Offrir
                          </button>
                          <button onClick={() => handleMarkPaid(session.id)} disabled={!!isActing}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, backgroundColor: '#1A1A18', color: '#fff', opacity: isActing ? 0.5 : 1 }}>
                            <Check size={11} />{isActing ? '…' : 'Payé'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {pending.length === 0 && (
              <div style={{ background: '#F0F9F4', borderRadius: 10, padding: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#2D7A4F', margin: 0, fontWeight: 500 }}>Tout est à jour ✓</p>
              </div>
            )}

            {/* Historique versements */}
            {payments.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <button
                  onClick={() => setShowHistory(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                    Versements ({payments.length})
                  </p>
                  <ChevronRight size={14} color="#A09890" style={{ transform: showHistory ? 'rotate(90deg)' : 'none', transition: 'transform 200ms' }} />
                </button>

                {showHistory && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
                    {payments.map((p, i) => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < payments.length - 1 ? '1px solid #F0EDE8' : 'none' }}>
                        <div>
                          <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0, fontFamily: 'monospace' }}>{p.amount.toFixed(2)} CHF</p>
                          <p style={{ fontSize: 12, color: '#7A7570', margin: '1px 0 0' }}>
                            {p.createdAt ? format(p.createdAt.toDate(), 'd MMM yyyy', { locale: fr }) : '—'}
                            {p.note ? ` · ${p.note}` : ''}
                          </p>
                        </div>
                        <p style={{ fontSize: 12, color: '#A09890', margin: 0 }}>{p.appliedToSessionIds.length} séance{p.appliedToSessionIds.length !== 1 ? 's' : ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Historique séances résolues */}
            {resolved.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                  Historique séances
                </p>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {resolved.map(({ session, entry }, i) => (
                    <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: i < resolved.length - 1 ? '1px solid #F0EDE8' : 'none' }}>
                      <div>
                        <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>
                          {format(session.startAt.toDate(), 'd MMM yyyy', { locale: fr })}
                        </p>
                        <p style={{ fontSize: 13, color: '#7A7570', margin: '1px 0 0', fontFamily: 'monospace' }}>
                          {entry.amountDueToCompany.toFixed(2)} CHF
                        </p>
                      </div>
                      <Badge variant={entry.status === 'paid' ? 'done' : 'offered'}>
                        {entry.status === 'paid' ? 'Payé' : 'Offert'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {selectedCoachId && loading && (
          <p style={{ color: '#A09890', fontSize: 14, textAlign: 'center', padding: 20 }}>Chargement…</p>
        )}

        {!selectedCoachId && (
          <p style={{ color: '#A09890', fontSize: 14, textAlign: 'center', padding: 20 }}>Sélectionne un coach pour voir son suivi.</p>
        )}
      </div>

      {showGlobalPay && selectedCoachId && user && (
        <GlobalPaySheet
          coachId={selectedCoachId}
          totalPending={totalPending}
          pendingRows={pending}
          onClose={() => setShowGlobalPay(false)}
          userId={user.id}
        />
      )}
    </>
  )
}
