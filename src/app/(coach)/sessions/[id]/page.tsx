'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { orderBy, doc, getDoc, updateDoc, deleteDoc, query, collection, where, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore'
import { ChevronLeft, MapPin, User, Users, Dumbbell, Clock, AlertTriangle, Send, RefreshCw, Pencil } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { requestPaymentLink } from '@/lib/services/payment.service'
import { sendNotification } from '@/lib/services/notification.service'
import { logActivity } from '@/lib/services/activity.service'
import { db } from '@/lib/firebase/firestore'
import type { Session, User as UserType, Service, Location, Client, AppSettings } from '@/types'

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #F0EDE8' }}>
      <div style={{ color: '#7A7570', marginTop: 1, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 11, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 15, color: '#1A1A18', margin: '2px 0 0' }}>{value}</p>
      </div>
    </div>
  )
}

const DEFAULT_WHATSAPP_TEMPLATE =
  'Bonjour {prenom}, voici votre lien de paiement pour la séance du {date} : {lien}'

function formatPhone(raw: string | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('41')) return digits
  if (digits.startsWith('0')) return `41${digits.slice(1)}`
  return digits
}

export default function SessionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string
  const { user, isAdmin } = useAuth()

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [cancelScope, setCancelScope] = useState<'none' | 'single' | 'future'>('none')
  const [deleteScope, setDeleteScope] = useState<'none' | 'pending'>('none')
  const [deleting, setDeleting] = useState(false)
  const [sendingFor, setSendingFor] = useState<Set<string>>(new Set())
  const [markingPaidFor, setMarkingPaidFor] = useState<Set<string>>(new Set())
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE)

  const { data: coaches } = useCollection<UserType>('users', [orderBy('firstName')])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: locations } = useCollection<Location>('locations', [orderBy('name')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])

  useEffect(() => {
    if (!sessionId) return
    getDoc(doc(db, 'sessions', sessionId)).then(snap => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() } as Session)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [sessionId])

  // Chargement du template WhatsApp depuis les réglages
  useEffect(() => {
    getDoc(doc(db, 'settings', 'app')).then(snap => {
      if (snap.exists()) {
        const settings = snap.data() as AppSettings
        if (settings.whatsappTemplate) setWhatsappTemplate(settings.whatsappTemplate)
      }
    }).catch(() => {})
  }, [])

  const handleCancel = useCallback(async (scope: 'single' | 'future') => {
    if (!session) return
    setCancelling(true)
    try {
      const batch = writeBatch(db)

      if (scope === 'single' || !session.recurrenceId) {
        batch.update(doc(db, 'sessions', sessionId), {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
        })
      } else {
        // Annuler cette séance + toutes les suivantes de la récurrence
        const allSnap = await getDocs(
          query(collection(db, 'sessions'), where('recurrenceId', '==', session.recurrenceId))
        )
        const threshold = session.startAt.toMillis()
        allSnap.docs
          .filter(d => {
            const data = d.data()
            return data.startAt.toMillis() >= threshold && data.status === 'planned'
          })
          .forEach(d => {
            batch.update(d.ref, { status: 'cancelled', cancelledAt: serverTimestamp() })
          })
        // Mettre fin à la récurrence
        batch.update(doc(db, 'recurrences', session.recurrenceId), {
          'rule.endDate': session.startAt,
          updatedAt: serverTimestamp(),
        })
      }

      await batch.commit()
      setSession(prev => prev ? { ...prev, status: 'cancelled' } : prev)
      setCancelScope('none')
      logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'session_cancelled', description: `${session.priceSnapshot?.serviceName ?? 'Séance'} · ${format(session.startAt.toDate(), 'd MMM yyyy HH:mm', { locale: fr })}`, sessionId })

      // Notifier les autres coachs de l'annulation
      if (session.coachIds.length > 1) {
        const others = session.coachIds.filter(id => id !== user?.id)
        if (others.length > 0) {
          sendNotification({
            userIds: others,
            title: 'Séance annulée',
            body: `La séance du ${format(session.startAt.toDate(), 'd MMM yyyy HH:mm', { locale: fr })} a été annulée.`,
            link: `/sessions/${sessionId}`,
          })
        }
      }
    } catch {
      // ignore
    } finally {
      setCancelling(false)
    }
  }, [session, sessionId])

  const handleDelete = useCallback(async (scope: 'single' | 'future') => {
    if (!session) return
    setDeleting(true)
    try {
      if (scope === 'single' || !session.recurrenceId) {
        await deleteDoc(doc(db, 'sessions', sessionId))
      } else {
        const allSnap = await getDocs(
          query(collection(db, 'sessions'), where('recurrenceId', '==', session.recurrenceId))
        )
        const threshold = session.startAt.toMillis()
        const batch = writeBatch(db)
        allSnap.docs
          .filter(d => d.data().startAt.toMillis() >= threshold)
          .forEach(d => batch.delete(d.ref))
        batch.update(doc(db, 'recurrences', session.recurrenceId), {
          'rule.endDate': session.startAt,
          updatedAt: serverTimestamp(),
        })
        await batch.commit()
      }
      logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'session_deleted', description: `${session.priceSnapshot?.serviceName ?? 'Séance'} · ${format(session.startAt.toDate(), 'd MMM yyyy HH:mm', { locale: fr })}`, sessionId })
      router.replace('/calendar' as never)
    } catch {
      setDeleting(false)
      setDeleteScope('none')
    }
  }, [session, sessionId, router, user])

  const handleSendPayment = useCallback(async (clientId: string) => {
    if (!session) return
    setSendingFor(prev => new Set(prev).add(clientId))
    try {
      const link = await requestPaymentLink(sessionId, clientId)
      console.log('[payment] lien généré :', link)

      // Mise à jour locale optimiste
      setSession(prev => {
        if (!prev) return prev
        return {
          ...prev,
          paymentDistribution: prev.paymentDistribution.map(p =>
            p.clientId === clientId
              ? { ...p, paymentStatus: 'link_sent', twintLink: link }
              : p
          ),
        }
      })

      // Ouverture WhatsApp
      const client = clients.find(c => c.id === clientId)
      const phone = formatPhone(client?.phone)
      const prenom = client?.firstName ?? ''
      const date = format(session.startAt.toDate(), 'd MMMM yyyy', { locale: fr })
      const text = whatsappTemplate
        .replace('{prenom}', prenom)
        .replace('{date}', date)
        .replace('{lien}', link)
        .replace('{twintLink}', link)
      console.log('[payment] template :', whatsappTemplate)
      console.log('[payment] message WhatsApp :', text)

      if (phone) {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
      } else {
        await navigator.clipboard.writeText(link).catch(() => {})
        alert(`Lien copié :\n${link}`)
      }

      // Fallback : copie toujours le lien dans le presse-papiers
      await navigator.clipboard.writeText(link).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('handleSendPayment: Error:', msg)
      alert(`Erreur : ${msg}`)
    } finally {
      setSendingFor(prev => {
        const next = new Set(prev)
        next.delete(clientId)
        return next
      })
    }
  }, [session, sessionId, clients, whatsappTemplate])

  const handleMarkPaid = useCallback(async (clientId: string) => {
    if (!session) return
    setMarkingPaidFor(prev => new Set(prev).add(clientId))
    try {
      const updated = session.paymentDistribution.map(p =>
        p.clientId === clientId
          ? { ...p, paymentStatus: 'paid' as const, amountPaid: p.amountDue }
          : p
      )
      const allSettled = updated.every(p => p.paymentStatus === 'paid' || p.paymentStatus === 'offered' || p.paymentStatus === 'credits')
      await updateDoc(doc(db, 'sessions', sessionId), {
        paymentDistribution: updated,
        paymentStatus: allSettled ? 'paid' : session.paymentStatus,
        updatedAt: serverTimestamp(),
      })
      setSession(prev => prev ? {
        ...prev,
        paymentDistribution: updated,
        paymentStatus: (allSettled ? 'paid' : prev.paymentStatus) as Session['paymentStatus'],
      } : prev)
    } catch (err) {
      alert('Erreur : ' + String(err))
    } finally {
      setMarkingPaidFor(prev => { const n = new Set(prev); n.delete(clientId); return n })
    }
  }, [session, sessionId])

  if (loading) {
    return (
      <>
        <TopBar title="Séance" left={<button onClick={() => router.back()} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}><ChevronLeft size={22} /></button>} />
        <TopBarSpacer />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
        </div>
      </>
    )
  }

  if (!session) {
    return (
      <>
        <TopBar title="Séance" left={<button onClick={() => router.back()} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}><ChevronLeft size={22} /></button>} />
        <TopBarSpacer />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, gap: 8 }}>
          <AlertTriangle size={32} color="#A09890" />
          <p style={{ color: '#7A7570', fontSize: 14 }}>Séance introuvable</p>
        </div>
      </>
    )
  }

  const service = services.find(s => s.id === session.serviceId)
  const location = locations.find(l => l.id === session.locationId)
  const sessionCoaches = coaches.filter(c => session.coachIds.includes(c.id))
  const sessionClients = clients.filter(c => session.clientIds.includes(c.id))

  const startDate = session.startAt.toDate()
  const endDate = session.endAt.toDate()
  const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000)
  const timeLabel = `${format(startDate, 'HH:mm')} → ${format(endDate, 'HH:mm')} (${durationMin} min)`

  const canClose = session.status === 'planned'
  const canCancel = session.status === 'planned' && isAdmin
  const isRecurring = !!session.recurrenceId
  const statusVariant = session.status === 'done' ? 'done' : session.status === 'cancelled' ? 'cancelled' : 'planned'

  const showPaymentActions = session.status === 'done'

  return (
    <>
      <TopBar
        title={service?.name ?? 'Séance'}
        subtitle={format(startDate, 'd MMM yyyy', { locale: fr })}
        left={
          <button onClick={() => router.back()} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={22} />
          </button>
        }
        right={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isRecurring && <Badge variant="muted"><RefreshCw size={9} />Récurrente</Badge>}
            <Badge variant={statusVariant}>{session.status === 'done' ? 'Effectué' : session.status === 'cancelled' ? 'Annulé' : 'Planifié'}</Badge>
            {session.status === 'planned' && (
              <button onClick={() => router.push(`/sessions/${sessionId}/edit` as never)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}>
                <Pencil size={17} />
              </button>
            )}
          </div>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9F8F6', minHeight: '100dvh' }}>

        {/* Infos principales */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '4px 14px' }}>
          <InfoRow icon={<Clock size={16} />} label="Horaire" value={timeLabel} />
          <InfoRow icon={<Dumbbell size={16} />} label="Service" value={`${service?.name ?? '—'} · ${service?.price?.toFixed(2) ?? '—'} CHF`} />
          <InfoRow icon={<MapPin size={16} />} label="Lieu" value={location?.name ?? '—'} />
          <InfoRow
            icon={<User size={16} />}
            label={`Coach${sessionCoaches.length > 1 ? 's' : ''}`}
            value={sessionCoaches.map(c => `${c.firstName} ${c.lastName}`).join(', ') || '—'}
          />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0' }}>
            <div style={{ color: '#7A7570', marginTop: 1, flexShrink: 0 }}><Users size={16} /></div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, margin: 0 }}>
                Clients ({sessionClients.length})
              </p>
              {sessionClients.length === 0
                ? <p style={{ fontSize: 15, color: '#A09890', margin: '2px 0 0' }}>Aucun client</p>
                : sessionClients.map(c => (
                    <p key={c.id} style={{ fontSize: 15, color: '#1A1A18', margin: '2px 0 0' }}>{c.firstName} {c.lastName}</p>
                  ))
              }
            </div>
          </div>
        </div>

        {/* Paiements */}
        {session.paymentDistribution.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Paiements
            </p>
            {session.paymentDistribution.map((p, i) => {
              const client = clients.find(c => c.id === p.clientId)
              const isSending = sendingFor.has(p.clientId)
              const isMarkingPaid = markingPaidFor.has(p.clientId)
              const canSendLink =
                showPaymentActions &&
                (p.paymentStatus === 'payment_to_request' || p.paymentStatus === 'link_sent')
              const canMarkPaid =
                showPaymentActions &&
                (p.paymentStatus === 'payment_to_request' || p.paymentStatus === 'link_sent')

              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 0',
                    borderBottom: i < session.paymentDistribution.length - 1 ? '1px solid #F0EDE8' : 'none',
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, color: '#1A1A18', margin: 0, fontWeight: 500 }}>
                      {client ? `${client.firstName} ${client.lastName}` : p.clientId}
                    </p>
                    <p style={{ fontSize: 13, color: '#7A7570', margin: '1px 0 0', fontFamily: 'monospace' }}>
                      {p.amountDue.toFixed(2)} CHF
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {canMarkPaid && (
                      <button
                        onClick={() => handleMarkPaid(p.clientId)}
                        disabled={isMarkingPaid}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', borderRadius: 6, border: 'none',
                          cursor: isMarkingPaid ? 'default' : 'pointer',
                          fontSize: 12, fontWeight: 600,
                          backgroundColor: '#E8F3EE', color: '#2D7A4F',
                          opacity: isMarkingPaid ? 0.6 : 1,
                        }}
                      >
                        {isMarkingPaid ? '…' : '✓ Payé'}
                      </button>
                    )}
                    {canSendLink && (
                      <button
                        onClick={() => handleSendPayment(p.clientId)}
                        disabled={isSending}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 10px', borderRadius: 6, border: 'none',
                          cursor: isSending ? 'default' : 'pointer',
                          fontSize: 12, fontWeight: 600,
                          backgroundColor: p.paymentStatus === 'link_sent' ? '#F0EDE8' : '#25D366',
                          color: p.paymentStatus === 'link_sent' ? '#7A7570' : '#fff',
                          opacity: isSending ? 0.6 : 1,
                        }}
                      >
                        <Send size={12} />
                        {isSending ? '…' : p.paymentStatus === 'link_sent' ? 'Renvoyer' : 'Envoyer'}
                      </button>
                    )}
                    <Badge variant={p.paymentStatus as 'payment_to_request' | 'link_sent' | 'paid' | 'offered' | 'credits' | 'cancelled'}>
                      {p.paymentStatus === 'payment_to_request' ? 'À demander' :
                       p.paymentStatus === 'link_sent' ? 'Lien envoyé' :
                       p.paymentStatus === 'paid' ? 'Payé' :
                       p.paymentStatus === 'offered' ? 'Offert' :
                       p.paymentStatus === 'credits' ? 'Crédits' : 'Annulé'}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Mode indépendant */}
        {session.isIndependent && (
          <div style={{ background: '#FDF6EA', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8A6200', fontWeight: 500 }}>Mode indépendant — location de salle</span>
          </div>
        )}
      </div>

      {/* Actions sticky */}
      <div style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #E5E1DA', zIndex: 60 }}>

          {/* ── Scope annulation récurrente ─────────────────────────── */}
          {cancelScope !== 'none' && isRecurring && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: '#7A7570', margin: 0, textAlign: 'center' }}>Annuler…</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleCancel('single')} disabled={cancelling}
                  style={{ flex: 1, height: 40, borderRadius: 8, border: '1px solid #E5E1DA', cursor: 'pointer', backgroundColor: 'transparent', color: '#C0392B', fontSize: 13, fontWeight: 500 }}>
                  {cancelling ? '…' : 'Cette séance'}
                </button>
                <button onClick={() => handleCancel('future')} disabled={cancelling}
                  style={{ flex: 1, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#C0392B', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                  {cancelling ? '…' : 'Celle-ci et les suivantes'}
                </button>
              </div>
              <button onClick={() => setCancelScope('none')} style={{ fontSize: 12, color: '#7A7570', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                Retour
              </button>
            </div>
          )}

          {/* ── Confirmation annulation simple ──────────────────────── */}
          {cancelScope !== 'none' && !isRecurring && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCancelScope('none')}
                style={{ flex: 1, height: 44, borderRadius: 8, border: '1px solid #E5E1DA', cursor: 'pointer', backgroundColor: 'transparent', color: '#7A7570', fontSize: 14, fontWeight: 500 }}>
                Retour
              </button>
              <button onClick={() => handleCancel('single')} disabled={cancelling}
                style={{ flex: 2, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#C0392B', color: '#fff', fontSize: 14, fontWeight: 600 }}>
                {cancelling ? 'Annulation…' : 'Confirmer l\'annulation'}
              </button>
            </div>
          )}

          {/* ── Scope suppression ───────────────────────────────────── */}
          {deleteScope !== 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: '#7A7570', margin: 0, textAlign: 'center' }}>
                {isRecurring ? 'Supprimer…' : 'Supprimer définitivement cette séance ?'}
              </p>
              {isRecurring ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleDelete('single')} disabled={deleting}
                    style={{ flex: 1, height: 40, borderRadius: 8, border: '1px solid #E5E1DA', cursor: 'pointer', backgroundColor: 'transparent', color: '#C0392B', fontSize: 13, fontWeight: 500 }}>
                    {deleting ? '…' : 'Cette séance'}
                  </button>
                  <button onClick={() => handleDelete('future')} disabled={deleting}
                    style={{ flex: 1, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#C0392B', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                    {deleting ? '…' : 'Celle-ci et les suivantes'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setDeleteScope('none')}
                    style={{ flex: 1, height: 44, borderRadius: 8, border: '1px solid #E5E1DA', cursor: 'pointer', backgroundColor: 'transparent', color: '#7A7570', fontSize: 14, fontWeight: 500 }}>
                    Retour
                  </button>
                  <button onClick={() => handleDelete('single')} disabled={deleting}
                    style={{ flex: 2, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#C0392B', color: '#fff', fontSize: 14, fontWeight: 600 }}>
                    {deleting ? 'Suppression…' : 'Confirmer la suppression'}
                  </button>
                </div>
              )}
              {isRecurring && (
                <button onClick={() => setDeleteScope('none')} style={{ fontSize: 12, color: '#7A7570', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                  Retour
                </button>
              )}
            </div>
          )}

          {/* ── Boutons principaux ──────────────────────────────────── */}
          {cancelScope === 'none' && deleteScope === 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {session.status === 'planned' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  {canCancel && (
                    <button onClick={() => setCancelScope('single')}
                      style={{ flex: 1, height: 44, borderRadius: 8, border: '1px solid #E5E1DA', cursor: 'pointer', backgroundColor: 'transparent', color: '#C0392B', fontSize: 14, fontWeight: 500 }}>
                      Annuler
                    </button>
                  )}
                  {canClose && (
                    <button onClick={() => router.push(`/sessions/${sessionId}/close` as never)}
                      style={{ flex: 2, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#1A1A18', color: '#fff', fontSize: 14, fontWeight: 600 }}>
                      Clôturer la séance
                    </button>
                  )}
                </div>
              )}
              <button onClick={() => setDeleteScope('pending')}
                style={{ width: '100%', height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: '#A09890', fontSize: 13, fontWeight: 500 }}>
                Supprimer la séance
              </button>
            </div>
          )}
        </div>
    </>
  )
}
