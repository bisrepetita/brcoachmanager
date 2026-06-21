'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { doc, getDoc, serverTimestamp, orderBy, writeBatch, collection, increment } from 'firebase/firestore'
import { ChevronLeft, Gift, CreditCard } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { logActivity } from '@/lib/services/activity.service'
import { db } from '@/lib/firebase/firestore'
import type { Session, Client, ClientPayment } from '@/types'

interface PaymentItem {
  clientId: string
  amountDue: number
  creditBalance: number
  status: 'payment_to_request' | 'offered' | 'credits'
  offeredReason: string
}

const backBtn: React.CSSProperties = {
  padding: 6, background: 'none', border: 'none',
  cursor: 'pointer', color: '#7A7570', display: 'flex', alignItems: 'center',
}
const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#A09890',
  textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px',
}

export default function CloseSessionPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string
  const { user } = useAuth()

  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [note, setNote] = useState('')
  const [items, setItems] = useState<PaymentItem[]>([])
  const [saving, setSaving] = useState(false)
  const initialized = useRef(false)

  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])

  useEffect(() => {
    if (!sessionId) return
    getDoc(doc(db, 'sessions', sessionId))
      .then(snap => {
        if (snap.exists()) {
          const s = { id: snap.id, ...snap.data() } as Session
          setSession(s)
          setNote(s.sessionNote ?? '')
        }
      })
      .finally(() => setLoadingSession(false))
  }, [sessionId])

  // Initialise les items une seule fois quand session + clients sont disponibles
  useEffect(() => {
    if (!session || initialized.current) return
    if (session.paymentDistribution.length === 0 || clients.length > 0) {
      initialized.current = true
      setItems(session.paymentDistribution.map(p => {
        const client = clients.find(c => c.id === p.clientId)
        const creditBalance = client?.sessionCredits ?? 0
        const wasAlreadyOffered = p.paymentStatus === 'offered'
        return {
          clientId: p.clientId,
          amountDue: p.amountDue,
          creditBalance,
          status: wasAlreadyOffered ? 'offered' : 'payment_to_request',
          offeredReason: '',
        }
      }))
    }
  }, [session, clients])

  const toggleOffered = useCallback((clientId: string) => {
    setItems(prev => prev.map(p => {
      if (p.clientId !== clientId) return p
      if (p.status === 'offered') {
        return { ...p, status: p.creditBalance > 0 ? 'credits' : 'payment_to_request' }
      }
      return { ...p, status: 'offered' }
    }))
  }, [])

  const toggleCredits = useCallback((clientId: string) => {
    setItems(prev => prev.map(p => {
      if (p.clientId !== clientId) return p
      return { ...p, status: p.status === 'credits' ? 'payment_to_request' : 'credits' }
    }))
  }, [])

  const setReason = useCallback((clientId: string, reason: string) => {
    setItems(prev => prev.map(p => p.clientId === clientId ? { ...p, offeredReason: reason } : p))
  }, [])

  const handleClose = useCallback(async () => {
    if (!session) return
    setSaving(true)
    try {
      const batch = writeBatch(db)
      const allOffered = items.every(p => p.status === 'offered')
      const allCredits = items.every(p => p.status === 'credits')
      const sessionPaymentStatus = allOffered ? 'offered' : allCredits ? 'credits' : 'payment_to_request'
      const offeredReason = items.find(p => p.status === 'offered' && p.offeredReason)?.offeredReason

      const updatedDistribution: ClientPayment[] = items.map(item => {
        const original = session.paymentDistribution.find(p => p.clientId === item.clientId)!
        return { ...original, paymentStatus: item.status }
      })

      batch.update(doc(db, 'sessions', sessionId), {
        status: 'done',
        completedAt: serverTimestamp(),
        paymentStatus: sessionPaymentStatus,
        paymentDistribution: updatedDistribution,
        ...(note.trim() ? { sessionNote: note.trim() } : {}),
        ...(offeredReason ? { offeredReason } : {}),
      })

      // Déduire 1 crédit par client qui utilise des crédits
      for (const item of items) {
        if (item.status === 'credits') {
          batch.update(doc(db, 'clients', item.clientId), {
            sessionCredits: increment(-1),
          })
          batch.set(doc(collection(db, 'creditTransactions')), {
            clientId: item.clientId,
            type: 'use',
            quantity: 1,
            sessionId,
            note: '',
            createdBy: user?.id ?? '',
            createdAt: serverTimestamp(),
          })
        }
      }

      await batch.commit()
      logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'session_done', description: `${session.priceSnapshot?.serviceName ?? 'Séance'} · ${format(session.startAt.toDate(), 'd MMM yyyy HH:mm', { locale: fr })}`, sessionId })
      router.replace(`/sessions/${sessionId}` as never)
    } catch {
      setSaving(false)
    }
  }, [session, sessionId, items, note, router, user])

  if (loadingSession || !session) {
    return (
      <>
        <TopBar
          title="Clôturer"
          left={<button onClick={() => router.back()} style={backBtn}><ChevronLeft size={22} /></button>}
        />
        <TopBarSpacer />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <p style={{ color: '#A09890' }}>{loadingSession ? 'Chargement…' : 'Séance introuvable'}</p>
        </div>
      </>
    )
  }

  const start = session.startAt.toDate()
  const pendingCount = items.filter(p => p.status === 'payment_to_request').length
  const creditsCount = items.filter(p => p.status === 'credits').length

  return (
    <>
      <TopBar
        title="Clôturer la séance"
        subtitle={format(start, 'd MMM yyyy · HH:mm', { locale: fr })}
        left={<button onClick={() => router.back()} style={backBtn}><ChevronLeft size={22} /></button>}
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 140px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9F8F6', minHeight: '100dvh' }}>

        {/* Note */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
          <p style={sectionLabel}>Note de séance</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Observations, progression, remarques…"
            rows={3}
            style={{
              width: '100%', border: '1px solid #E5E1DA', borderRadius: 8,
              padding: '8px 10px', fontSize: 14, color: '#1A1A18',
              background: '#F9F8F6', outline: 'none', resize: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Paiements */}
        {items.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
            <p style={sectionLabel}>Paiements</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {items.map((item, idx) => {
                const client = clients.find(c => c.id === item.clientId)
                const name = client ? `${client.firstName} ${client.lastName}` : '—'
                const isOffered = item.status === 'offered'
                const isCredits = item.status === 'credits'
                const isLast = idx === items.length - 1

                return (
                  <div key={item.clientId} style={{ paddingTop: idx === 0 ? 0 : 10, paddingBottom: isLast ? 0 : 10, borderBottom: isLast ? 'none' : '1px solid #F0EDE8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>{name}</p>
                        <p style={{ fontSize: 13, color: '#7A7570', margin: '1px 0 0', fontFamily: 'monospace' }}>
                          {item.amountDue.toFixed(2)} CHF
                          {item.creditBalance > 0 && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: '#5B8A6A', fontFamily: 'inherit', fontWeight: 500 }}>
                              · {item.creditBalance} crédit{item.creditBalance > 1 ? 's' : ''}
                            </span>
                          )}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {item.creditBalance > 0 && (
                          <button
                            onClick={() => toggleCredits(item.clientId)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              fontSize: 12, fontWeight: 500,
                              backgroundColor: isCredits ? '#E8F3EE' : '#F0EDE8',
                              color: isCredits ? '#2D7A4F' : '#7A7570',
                            }}
                          >
                            <CreditCard size={12} />
                            Crédit
                          </button>
                        )}
                        <button
                          onClick={() => toggleOffered(item.clientId)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 500,
                            backgroundColor: isOffered ? '#FDF6EA' : '#F0EDE8',
                            color: isOffered ? '#8A6200' : '#7A7570',
                          }}
                        >
                          <Gift size={12} />
                          {isOffered ? 'Offert' : 'Offrir'}
                        </button>
                      </div>
                    </div>

                    {isOffered && (
                      <input
                        type="text"
                        placeholder="Raison (optionnel)"
                        value={item.offeredReason}
                        onChange={e => setReason(item.clientId, e.target.value)}
                        style={{
                          marginTop: 7, width: '100%', border: '1px solid #F0EDE8',
                          borderRadius: 6, padding: '5px 8px', fontSize: 13,
                          color: '#1A1A18', background: '#FDF6EA', outline: 'none',
                          boxSizing: 'border-box', fontFamily: 'inherit',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Résumé */}
        <div style={{ background: '#F0EDE8', borderRadius: 10, padding: '10px 14px' }}>
          <p style={{ fontSize: 13, color: '#7A7570', margin: 0 }}>
            {pendingCount === 0 && creditsCount === 0
              ? 'Aucun paiement à demander.'
              : pendingCount === 0
                ? `${creditsCount} crédit${creditsCount > 1 ? 's' : ''} déduit${creditsCount > 1 ? 's' : ''} — aucun paiement à demander.`
                : `${pendingCount} paiement${pendingCount > 1 ? 's' : ''} à demander après clôture.`}
          </p>
        </div>
      </div>

      <div style={{
        position: 'fixed',
        bottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))',
        left: 0, right: 0, padding: '12px 16px',
        background: '#fff', borderTop: '1px solid #E5E1DA', zIndex: 60,
      }}>
        <button
          onClick={handleClose}
          disabled={saving}
          style={{
            width: '100%', height: 48, borderRadius: 8, border: 'none',
            cursor: saving ? 'default' : 'pointer',
            backgroundColor: saving ? '#E5E1DA' : '#1A1A18',
            color: saving ? '#A09890' : '#fff',
            fontSize: 15, fontWeight: 600,
          }}
        >
          {saving ? 'Clôture en cours…' : 'Confirmer la clôture'}
        </button>
      </div>
    </>
  )
}
