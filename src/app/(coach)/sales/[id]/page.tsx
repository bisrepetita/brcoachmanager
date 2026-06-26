'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { orderBy, doc, getDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { ChevronLeft, Send, Trash2 } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { requestSalePaymentLink } from '@/lib/services/payment.service'
import { db } from '@/lib/firebase/firestore'
import type { Sale, Client, Service, ClientGroup } from '@/types'

const DEFAULT_WHATSAPP_TEMPLATE = 'Bonjour {prenom}, voici votre lien de paiement : {lien}'

function formatPhone(raw: string | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('41')) return digits
  if (digits.startsWith('0')) return `41${digits.slice(1)}`
  return digits
}

export default function SaleDetailPage() {
  const router = useRouter()
  const params = useParams()
  const saleId = params.id as string
  const { user } = useAuth()

  const [sale, setSale] = useState<Sale | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendingFor, setSendingFor] = useState<Set<string>>(new Set())
  const [markingPaidFor, setMarkingPaidFor] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: groups } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])

  useEffect(() => {
    if (!saleId) return
    getDoc(doc(db, 'sales', saleId))
      .then(snap => { if (snap.exists()) setSale({ id: snap.id, ...snap.data() } as Sale) })
      .finally(() => setLoading(false))
  }, [saleId])

  const handleSendLink = useCallback(async (clientId: string) => {
    if (!sale) return
    setSendingFor(prev => new Set(prev).add(clientId))
    try {
      const link = await requestSalePaymentLink(saleId, clientId)

      setSale(prev => prev ? {
        ...prev,
        paymentDistribution: prev.paymentDistribution.map(p =>
          p.clientId === clientId ? { ...p, paymentStatus: 'link_sent', twintLink: link } : p
        ),
      } : prev)

      const client = clients.find(c => c.id === clientId)
      const phone = formatPhone(client?.phone)
      const prenom = client?.firstName ?? ''
      const text = DEFAULT_WHATSAPP_TEMPLATE
        .replace('{prenom}', prenom)
        .replace('{lien}', link)
        .replace('{twintLink}', link)

      if (phone) {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
      } else {
        await navigator.clipboard.writeText(link).catch(() => {})
        alert(`Lien copié :\n${link}`)
      }
      await navigator.clipboard.writeText(link).catch(() => {})
    } catch (err) {
      alert('Erreur : ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSendingFor(prev => { const n = new Set(prev); n.delete(clientId); return n })
    }
  }, [sale, saleId, clients])

  const handleMarkPaid = useCallback(async (clientId: string) => {
    if (!sale) return
    setMarkingPaidFor(prev => new Set(prev).add(clientId))
    try {
      const updated = sale.paymentDistribution.map(p =>
        p.clientId === clientId ? { ...p, paymentStatus: 'paid' as const, amountPaid: p.amountDue } : p
      )
      const allSettled = updated.every(p => ['paid', 'offered', 'credits', 'cancelled'].includes(p.paymentStatus))
      await updateDoc(doc(db, 'sales', saleId), {
        paymentDistribution: updated,
        paymentStatus: allSettled ? 'paid' : sale.paymentStatus,
        updatedAt: serverTimestamp(),
      })
      setSale(prev => prev ? { ...prev, paymentDistribution: updated, paymentStatus: allSettled ? 'paid' : prev.paymentStatus } : prev)
    } catch (err) {
      alert('Erreur : ' + String(err))
    } finally {
      setMarkingPaidFor(prev => { const n = new Set(prev); n.delete(clientId); return n })
    }
  }, [sale, saleId])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'sales', saleId))
      router.replace('/sales' as never)
    } catch {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }, [saleId, router])

  if (loading || !sale) {
    return (
      <>
        <TopBar title="Vente" left={<button onClick={() => router.back()} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}><ChevronLeft size={22} /></button>} />
        <TopBarSpacer />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <p style={{ color: '#A09890', fontSize: 14 }}>{loading ? 'Chargement…' : 'Vente introuvable'}</p>
        </div>
      </>
    )
  }

  const service = services.find(s => s.id === sale.serviceId)
  const saleGroup = sale.clientGroupId ? groups.find(g => g.id === sale.clientGroupId) : undefined
  const createdDate = sale.createdAt?.toDate ? format(sale.createdAt.toDate(), 'd MMM yyyy', { locale: fr }) : '—'

  const totalDue = sale.paymentDistribution.reduce((s, p) => s + p.amountDue, 0)
  const totalPaid = sale.paymentDistribution.reduce((s, p) => s + p.amountPaid, 0)
  const pendingCount = sale.paymentDistribution.filter(p => p.paymentStatus === 'payment_to_request').length
  const paidCount = sale.paymentDistribution.filter(p => p.paymentStatus === 'paid').length

  return (
    <>
      <TopBar
        title={sale.priceSnapshot?.serviceName ?? service?.name ?? 'Vente'}
        subtitle={createdDate}
        left={<button onClick={() => router.back()} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}><ChevronLeft size={22} /></button>}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Badge variant={sale.paymentStatus as 'payment_to_request' | 'link_sent' | 'paid' | 'offered' | 'credits' | 'cancelled'}>
              {sale.paymentStatus === 'paid' ? 'Payé' :
               sale.paymentStatus === 'link_sent' ? 'En attente' :
               sale.paymentStatus === 'offered' ? 'Offert' : 'À demander'}
            </Badge>
          </div>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9F8F6', minHeight: '100dvh' }}>

        {/* Résumé */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>
                {service?.name ?? sale.priceSnapshot?.serviceName ?? '—'}
              </p>
              {saleGroup && (
                <p style={{ fontSize: 13, color: '#7A7570', margin: '2px 0 0' }}>Groupe · {saleGroup.name}</p>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0, fontFamily: 'monospace' }}>
                {totalDue.toFixed(2)} CHF
              </p>
              <p style={{ fontSize: 12, color: '#A09890', margin: '2px 0 0' }}>
                {paidCount}/{sale.paymentDistribution.length} payé{paidCount > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {sale.note && (
            <p style={{ fontSize: 13, color: '#7A7570', margin: '8px 0 0', paddingTop: 8, borderTop: '1px solid #F0EDE8' }}>{sale.note}</p>
          )}
        </div>

        {/* Paiements */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
            Paiements
          </p>
          {sale.paymentDistribution.map((p, i) => {
            const client = clients.find(c => c.id === p.clientId)
            const isSending = sendingFor.has(p.clientId)
            const isMarkingPaid = markingPaidFor.has(p.clientId)
            const canAct = p.paymentStatus === 'payment_to_request' || p.paymentStatus === 'link_sent'
            const isLast = i === sale.paymentDistribution.length - 1

            return (
              <div
                key={p.clientId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 0',
                  borderBottom: isLast ? 'none' : '1px solid #F0EDE8',
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
                  {canAct && (
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
                  {canAct && (
                    <button
                      onClick={() => handleSendLink(p.clientId)}
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

        {/* Bilan */}
        {sale.paymentDistribution.length > 1 && (
          <div style={{ background: '#F0EDE8', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ fontSize: 13, color: '#7A7570', margin: 0 }}>
              {pendingCount === 0
                ? `Tout encaissé — ${totalPaid.toFixed(2)} CHF`
                : `${pendingCount} paiement${pendingCount > 1 ? 's' : ''} en attente · ${totalPaid.toFixed(2)} / ${totalDue.toFixed(2)} CHF encaissé${totalPaid > 0 ? '' : ''}`}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #E5E1DA', zIndex: 60 }}>
        {deleteConfirm ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDeleteConfirm(false)} style={{ flex: 1, height: 44, borderRadius: 8, border: '1px solid #E5E1DA', cursor: 'pointer', background: 'transparent', color: '#7A7570', fontSize: 14, fontWeight: 500 }}>
              Retour
            </button>
            <button onClick={handleDelete} disabled={deleting} style={{ flex: 2, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#C0392B', color: '#fff', fontSize: 14, fontWeight: 600 }}>
              {deleting ? 'Suppression…' : 'Confirmer'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDeleteConfirm(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#A09890', fontSize: 13, fontWeight: 500 }}
          >
            <Trash2 size={14} />
            Supprimer la vente
          </button>
        )}
      </div>
    </>
  )
}
