'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, ShoppingBag } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { db } from '@/lib/firebase/firestore'
import type { Sale, Client, ClientGroup } from '@/types'

const STATUS_FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'payment_to_request', label: 'À demander' },
  { value: 'link_sent', label: 'En attente' },
  { value: 'paid', label: 'Payées' },
]

export default function SalesPage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])
  const { data: groups } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])

  useEffect(() => {
    if (!user) { setLoading(false); return }

    const q = isAdmin
      ? query(collection(db, 'sales'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'sales'), where('coachIds', 'array-contains', user.id), orderBy('createdAt', 'desc'))

    return onSnapshot(q, snap => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)))
      setLoading(false)
    }, () => setLoading(false))
  }, [user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return sales
    return sales.filter(s => s.paymentStatus === statusFilter)
  }, [sales, statusFilter])

  return (
    <>
      <TopBar
        title="Ventes"
        right={
          <button
            onClick={() => router.push('/sales/new' as never)}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#1A1A18', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Plus size={18} color="#fff" />
          </button>
        }
      />
      <TopBarSpacer />

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0', overflowX: 'auto' }}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
              backgroundColor: statusFilter === f.value ? '#1A1A18' : '#F0EDE8',
              color: statusFilter === f.value ? '#fff' : '#7A7570',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', gap: 12 }}>
          <ShoppingBag size={44} color="#A09890" strokeWidth={1.5} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Aucune vente</p>
          <p style={{ fontSize: 14, color: '#7A7570', margin: 0, textAlign: 'center' }}>
            {statusFilter !== 'all' ? 'Aucune vente pour ce filtre.' : 'Créez votre première vente avec le bouton +.'}
          </p>
        </div>
      ) : (
        <div style={{ padding: '12px 16px 80px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(sale => {
            const group = sale.clientGroupId ? groups.find(g => g.id === sale.clientGroupId) : undefined
            const totalDue = sale.paymentDistribution.reduce((s, p) => s + p.amountDue, 0)
            const totalPaid = sale.paymentDistribution.reduce((s, p) => s + p.amountPaid, 0)
            const clientCount = sale.clientIds.length
            const date = sale.createdAt?.toDate ? format(sale.createdAt.toDate(), 'd MMM yyyy', { locale: fr }) : '—'

            // Noms clients (jusqu'à 2)
            const clientNames = group
              ? `Groupe · ${group.name}`
              : sale.clientIds.slice(0, 2).map(id => {
                  const c = clients.find(cl => cl.id === id)
                  return c ? `${c.firstName} ${c.lastName}` : null
                }).filter(Boolean).join(', ') + (clientCount > 2 ? ` +${clientCount - 2}` : '')

            return (
              <button
                key={sale.id}
                onClick={() => router.push(`/sales/${sale.id}` as never)}
                style={{
                  background: '#fff', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0 }}>
                      {sale.priceSnapshot?.serviceName ?? '—'}
                    </p>
                    <p style={{ fontSize: 12, color: '#A09890', margin: '2px 0 0' }}>{date}</p>
                    {clientNames && (
                      <p style={{ fontSize: 13, color: '#7A7570', margin: '2px 0 0' }}>{clientNames}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0, fontFamily: 'monospace' }}>
                      {totalDue.toFixed(2)} CHF
                    </p>
                    <Badge variant={sale.paymentStatus as 'payment_to_request' | 'link_sent' | 'paid' | 'offered' | 'credits' | 'cancelled'}>
                      {sale.paymentStatus === 'paid' ? 'Payé' :
                       sale.paymentStatus === 'link_sent' ? 'En attente' :
                       sale.paymentStatus === 'offered' ? 'Offert' : 'À demander'}
                    </Badge>
                    {totalPaid > 0 && totalPaid < totalDue && (
                      <p style={{ fontSize: 11, color: '#A09890', margin: 0, fontFamily: 'monospace' }}>
                        {totalPaid.toFixed(2)} encaissé
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
