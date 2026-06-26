'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { orderBy, serverTimestamp, addDoc, collection } from 'firebase/firestore'
import { ChevronLeft, Search, Users, User, Check } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { db } from '@/lib/firebase/firestore'
import type { Service, Client, ClientGroup, PricingMode, ClientPayment } from '@/types'

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#A09890',
  textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px',
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 10, padding: '12px 14px',
}
const input: React.CSSProperties = {
  width: '100%', border: '1px solid #E5E1DA', borderRadius: 8,
  padding: '9px 12px', fontSize: 14, color: '#1A1A18',
  background: '#F9F8F6', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
}

export default function NewSalePage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()

  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])
  const { data: groups } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])

  const [serviceId, setServiceId] = useState('')
  const [clientMode, setClientMode] = useState<'individual' | 'group'>('individual')
  const [search, setSearch] = useState('')
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  // Pour les groupes : membres décochés (absents)
  const [uncheckedMemberIds, setUncheckedMemberIds] = useState<Set<string>>(new Set())
  const [pricingMode, setPricingMode] = useState<PricingMode>('per_person')
  const [customTotalPrice, setCustomTotalPrice] = useState('')
  const [useCustomPrice, setUseCustomPrice] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedService = services.find(s => s.id === serviceId)
  const basePrice = selectedService?.price ?? 0

  // Clients effectifs selon le mode
  const selectedGroup = groups.find(g => g.id === selectedGroupId)
  const effectiveClientIds = useMemo(() => {
    if (clientMode === 'group' && selectedGroup) {
      return selectedGroup.clientIds.filter(id => !uncheckedMemberIds.has(id))
    }
    return selectedClientIds
  }, [clientMode, selectedGroup, uncheckedMemberIds, selectedClientIds])

  // Calcul du prix
  const totalPrice = useCustomPrice && customTotalPrice
    ? parseFloat(customTotalPrice) || 0
    : pricingMode === 'split_between_group'
      ? basePrice
      : basePrice * (effectiveClientIds.length || 1)

  const pricePerClient = effectiveClientIds.length > 0
    ? pricingMode === 'per_person'
      ? (useCustomPrice && customTotalPrice ? (parseFloat(customTotalPrice) || 0) : basePrice)
      : Math.round((totalPrice / effectiveClientIds.length) * 100) / 100
    : 0

  // Recherche clients (mode individuel)
  const filteredClients = useMemo(() => {
    const q = search.toLowerCase()
    return clients.filter(c =>
      !selectedClientIds.includes(c.id) &&
      (`${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
    ).slice(0, 8)
  }, [clients, search, selectedClientIds])

  const toggleGroupMember = (id: string) => {
    setUncheckedMemberIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSubmit = !!(serviceId && effectiveClientIds.length > 0 &&
    (clientMode === 'individual' ? true : !!selectedGroupId))

  const handleSubmit = useCallback(async () => {
    if (!user || !canSubmit || !selectedService) return
    setSaving(true)
    try {
      const customPricePerClient = (useCustomPrice && pricingMode === 'per_person' && customTotalPrice)
        ? parseFloat(customTotalPrice) || undefined
        : undefined
      const customTotal = (useCustomPrice && pricingMode === 'split_between_group' && customTotalPrice)
        ? parseFloat(customTotalPrice) || undefined
        : undefined

      const distribution: ClientPayment[] = effectiveClientIds.map(cId => ({
        clientId: cId,
        amountDue: pricePerClient,
        amountPaid: 0,
        paymentStatus: 'payment_to_request',
      }))

      const saleData = {
        serviceId,
        coachIds: [user.id],
        clientIds: effectiveClientIds,
        ...(clientMode === 'group' && selectedGroupId ? { clientGroupId: selectedGroupId } : {}),
        pricingMode,
        paymentDistribution: distribution,
        paymentStatus: 'payment_to_request',
        note: note.trim(),
        priceSnapshot: {
          serviceName: selectedService.name,
          basePrice: selectedService.price,
          pricingMode,
          ...(customPricePerClient !== undefined ? { customPricePerClient } : {}),
          ...(customTotal !== undefined ? { customTotalPrice: customTotal } : {}),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      const ref = await addDoc(collection(db, 'sales'), saleData)
      router.replace(`/sales/${ref.id}` as never)
    } catch {
      setSaving(false)
    }
  }, [user, canSubmit, selectedService, effectiveClientIds, pricePerClient, serviceId, clientMode, selectedGroupId, pricingMode, note, useCustomPrice, customTotalPrice])

  return (
    <>
      <TopBar
        title="Nouvelle vente"
        left={<button onClick={() => router.back()} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}><ChevronLeft size={22} /></button>}
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9F8F6', minHeight: '100dvh' }}>

        {/* Service */}
        <div style={card}>
          <p style={label}>Service *</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {services.map(s => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 8,
                  border: serviceId === s.id ? '1.5px solid #1A1A18' : '1px solid #E5E1DA',
                  background: serviceId === s.id ? '#F9F8F6' : '#fff',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 14, color: '#1A1A18', fontWeight: serviceId === s.id ? 600 : 400 }}>{s.name}</span>
                <span style={{ fontSize: 13, color: '#7A7570', fontFamily: 'monospace' }}>{s.price.toFixed(2)} CHF</span>
              </button>
            ))}
          </div>
        </div>

        {/* Mode client */}
        <div style={card}>
          <p style={label}>Clients *</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['individual', 'group'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setClientMode(m); setSelectedClientIds([]); setSelectedGroupId(''); setUncheckedMemberIds(new Set()) }}
                style={{
                  flex: 1, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500,
                  backgroundColor: clientMode === m ? '#1A1A18' : '#F0EDE8',
                  color: clientMode === m ? '#fff' : '#7A7570',
                }}
              >
                {m === 'individual' ? <><User size={13} style={{ display: 'inline', marginRight: 5 }} />Individuel</> : <><Users size={13} style={{ display: 'inline', marginRight: 5 }} />Groupe</>}
              </button>
            ))}
          </div>

          {clientMode === 'individual' && (
            <>
              {/* Tags sélectionnés */}
              {selectedClientIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {selectedClientIds.map(id => {
                    const c = clients.find(cl => cl.id === id)
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedClientIds(prev => prev.filter(x => x !== id))}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: '#1A1A18', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
                      >
                        {c ? `${c.firstName} ${c.lastName}` : id} ×
                      </button>
                    )
                  })}
                </div>
              )}
              {/* Recherche */}
              <div style={{ position: 'relative', marginBottom: 4 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#A09890', pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un client…"
                  style={{ ...input, paddingLeft: 32 }}
                />
              </div>
              {search && filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClientIds(prev => [...prev, c.id]); setSearch('') }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 4px', background: 'none', border: 'none', borderBottom: '1px solid #F0EDE8', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 14, color: '#1A1A18' }}>{c.firstName} {c.lastName}</span>
                  {c.phone && <span style={{ fontSize: 12, color: '#A09890' }}>{c.phone}</span>}
                </button>
              ))}
            </>
          )}

          {clientMode === 'group' && (
            <>
              {/* Sélection du groupe */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setSelectedGroupId(g.id); setUncheckedMemberIds(new Set()) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px', borderRadius: 8,
                      border: selectedGroupId === g.id ? '1.5px solid #1A1A18' : '1px solid #E5E1DA',
                      background: '#fff', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 14, color: '#1A1A18', fontWeight: selectedGroupId === g.id ? 600 : 400 }}>{g.name}</span>
                    <span style={{ fontSize: 12, color: '#A09890' }}>{g.clientIds.length} membres</span>
                  </button>
                ))}
              </div>

              {/* Liste membres avec checkbox */}
              {selectedGroup && selectedGroup.clientIds.length > 0 && (
                <div style={{ borderTop: '1px solid #F0EDE8', paddingTop: 10 }}>
                  <p style={{ fontSize: 12, color: '#A09890', margin: '0 0 8px' }}>Membres présents</p>
                  {selectedGroup.clientIds.map(id => {
                    const c = clients.find(cl => cl.id === id)
                    const isChecked = !uncheckedMemberIds.has(id)
                    return (
                      <button
                        key={id}
                        onClick={() => toggleGroupMember(id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{
                          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                          border: isChecked ? 'none' : '1.5px solid #C8C4BE',
                          background: isChecked ? '#1A1A18' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isChecked && <Check size={12} color="#fff" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: 14, color: isChecked ? '#1A1A18' : '#A09890' }}>
                          {c ? `${c.firstName} ${c.lastName}` : id}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Mode de prix */}
        {serviceId && (
          <div style={card}>
            <p style={label}>Tarification</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['per_person', 'split_between_group'] as PricingMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setPricingMode(m)}
                  style={{
                    flex: 1, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 500,
                    backgroundColor: pricingMode === m ? '#1A1A18' : '#F0EDE8',
                    color: pricingMode === m ? '#fff' : '#7A7570',
                  }}
                >
                  {m === 'per_person' ? 'Par personne' : 'Diviser le total'}
                </button>
              ))}
            </div>

            {/* Prix personnalisé */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: useCustomPrice ? 8 : 0 }}>
              <button
                onClick={() => setUseCustomPrice(v => !v)}
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: 'none', cursor: 'pointer',
                  background: useCustomPrice ? '#1A1A18' : '#F0EDE8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {useCustomPrice && <Check size={12} color="#fff" strokeWidth={3} />}
              </button>
              <span style={{ fontSize: 13, color: '#7A7570' }}>Prix personnalisé</span>
            </div>

            {useCustomPrice && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customTotalPrice}
                  onChange={e => setCustomTotalPrice(e.target.value)}
                  placeholder={pricingMode === 'per_person' ? 'Prix par personne' : 'Total à diviser'}
                  style={{ ...input, flex: 1 }}
                />
                <span style={{ fontSize: 13, color: '#7A7570', flexShrink: 0 }}>CHF</span>
              </div>
            )}

            {/* Résumé prix */}
            {effectiveClientIds.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#F9F8F6', borderRadius: 8 }}>
                <p style={{ fontSize: 13, color: '#7A7570', margin: 0 }}>
                  {effectiveClientIds.length} client{effectiveClientIds.length > 1 ? 's' : ''} ·{' '}
                  <span style={{ fontFamily: 'monospace', color: '#1A1A18', fontWeight: 600 }}>
                    {pricePerClient.toFixed(2)} CHF
                  </span>
                  {' '}par personne
                  {pricingMode === 'split_between_group' && effectiveClientIds.length > 1 && (
                    <span style={{ color: '#A09890' }}> (total {totalPrice.toFixed(2)} CHF)</span>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Note */}
        <div style={card}>
          <p style={label}>Note (optionnel)</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Description, référence, remarque…"
            rows={2}
            style={{ ...input, resize: 'none' }}
          />
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #E5E1DA', zIndex: 60 }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
          style={{
            width: '100%', height: 48, borderRadius: 8, border: 'none',
            cursor: canSubmit && !saving ? 'pointer' : 'default',
            backgroundColor: canSubmit && !saving ? '#1A1A18' : '#E5E1DA',
            color: canSubmit && !saving ? '#fff' : '#A09890',
            fontSize: 15, fontWeight: 600,
          }}
        >
          {saving ? 'Création…' : 'Créer la vente'}
        </button>
      </div>
    </>
  )
}
