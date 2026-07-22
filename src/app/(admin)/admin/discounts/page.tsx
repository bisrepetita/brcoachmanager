'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { orderBy } from 'firebase/firestore'
import { Plus, ArrowLeft, Percent, Pencil, Trash2, Search } from 'lucide-react'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import type { Discount, DiscountKind, DiscountValueType, Service, Client } from '@/types'
import { DISCOUNT_VALUE_TYPE_LABELS } from '@/types'

function isExpired(d: Discount): boolean {
  if (!d.endAt) return false
  return d.endAt.toDate() < new Date()
}

function scopeSummary(d: Discount, services: Service[]): string {
  if (d.scope.allPublicServices) return 'Séances publiques'
  if (d.scope.serviceIds.length === 0) return 'Tous les services'
  const names = d.scope.serviceIds.map(id => services.find(s => s.id === id)?.name).filter(Boolean)
  return names.length > 0 ? names.join(', ') : `${d.scope.serviceIds.length} service(s)`
}

function DiscountRow({ d, services, clients, onEdit, onDelete }: {
  d: Discount; services: Service[]; clients: Client[]; onEdit: () => void; onDelete: () => void
}) {
  const client = d.kind === 'client' ? clients.find(c => c.id === d.clientId) : undefined
  const expired = isExpired(d)
  const valueLabel = d.discountType === 'percentage' ? `-${d.value}%` : `-${d.value.toFixed(2)} CHF`

  return (
    <div className="flex items-center gap-2 p-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
            {d.kind === 'code' ? d.code : (client ? `${client.firstName} ${client.lastName}` : 'Client introuvable')}
          </p>
          <Badge variant={d.kind === 'code' ? 'default' : 'gold'}>{d.kind === 'code' ? 'Code' : 'Rabais client'}</Badge>
          {!d.active && <Badge variant="muted">Désactivée</Badge>}
          {expired && <Badge variant="cancelled">Expirée</Badge>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="amount-mono text-[13px] font-semibold text-[var(--color-text-primary)]">{valueLabel}</span>
          <Badge variant="muted">{scopeSummary(d, services)}</Badge>
          {d.maxUsesGlobal !== undefined && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">{d.usesCount}/{d.maxUsesGlobal} utilisations</span>
          )}
          {d.maxUsesGlobal === undefined && d.usesCount > 0 && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">{d.usesCount} utilisation{d.usesCount > 1 ? 's' : ''}</span>
          )}
        </div>
        {d.note && <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">{d.note}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-elevated)]">
          <Pencil size={14} style={{ color: '#7A7570' }} />
        </button>
        <button onClick={onDelete} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-danger-bg)]">
          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
        </button>
      </div>
    </div>
  )
}

export default function DiscountsPage() {
  const router = useRouter()
  const { data: discounts, loading } = useCollection<Discount>('discounts', [])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])

  const ordered = useMemo(() =>
    [...discounts].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
  [discounts])

  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Discount | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [kind, setKind] = useState<DiscountKind>('code')
  const [code, setCode] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [discountType, setDiscountType] = useState<DiscountValueType>('percentage')
  const [value, setValue] = useState('')
  const [allPublicServices, setAllPublicServices] = useState(true)
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [maxUsesGlobal, setMaxUsesGlobal] = useState('')
  const [maxUsesPerClient, setMaxUsesPerClient] = useState('')
  const [active, setActive] = useState(true)
  const [note, setNote] = useState('')

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return []
    const q = clientSearch.toLowerCase()
    return clients.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)).slice(0, 8)
  }, [clients, clientSearch])
  const selectedClient = clients.find(c => c.id === clientId)

  function resetForm() {
    setKind('code'); setCode(''); setClientId(''); setClientSearch('')
    setDiscountType('percentage'); setValue('')
    setAllPublicServices(true); setServiceIds([])
    setStartAt(''); setEndAt(''); setMaxUsesGlobal(''); setMaxUsesPerClient('')
    setActive(true); setNote(''); setError(null)
  }

  function openCreate() { resetForm(); setEditing(null); setSheet('create') }

  function openEdit(d: Discount) {
    setEditing(d)
    setKind(d.kind); setCode(d.code ?? ''); setClientId(d.clientId ?? ''); setClientSearch('')
    setDiscountType(d.discountType); setValue(String(d.value))
    setAllPublicServices(d.scope.allPublicServices); setServiceIds(d.scope.serviceIds)
    setStartAt(d.startAt ? d.startAt.toDate().toISOString().slice(0, 10) : '')
    setEndAt(d.endAt ? d.endAt.toDate().toISOString().slice(0, 10) : '')
    setMaxUsesGlobal(d.maxUsesGlobal !== undefined ? String(d.maxUsesGlobal) : '')
    setMaxUsesPerClient(d.maxUsesPerClient !== undefined ? String(d.maxUsesPerClient) : '')
    setActive(d.active); setNote(d.note ?? ''); setError(null)
    setSheet('edit')
  }

  function close() { setSheet(null); setEditing(null) }

  function toggleService(id: string) {
    setServiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const canSubmit = kind === 'code'
    ? !!(code.trim() && value)
    : !!(clientId && value)

  async function handleSave() {
    if (!canSubmit) { setError('Renseigne les champs requis.'); return }
    const numValue = parseFloat(value)
    if (!numValue || numValue <= 0) { setError('La valeur de la remise doit être positive.'); return }
    if (discountType === 'percentage' && numValue > 100) { setError('Un pourcentage ne peut pas dépasser 100.'); return }
    setSaving(true); setError(null)
    try {
      const data = {
        kind,
        ...(kind === 'code' ? { code: code.trim().toUpperCase() } : { clientId }),
        discountType, value: numValue,
        scope: { serviceIds: allPublicServices ? [] : serviceIds, allPublicServices },
        ...(startAt ? { startAt: new Date(startAt) } : {}),
        ...(endAt ? { endAt: new Date(`${endAt}T23:59:59`) } : {}),
        ...(maxUsesGlobal ? { maxUsesGlobal: parseInt(maxUsesGlobal, 10) } : {}),
        ...(maxUsesPerClient ? { maxUsesPerClient: parseInt(maxUsesPerClient, 10) } : {}),
        active,
        ...(note.trim() ? { note: note.trim() } : {}),
      }
      if (sheet === 'create') {
        await createDoc('discounts', { ...data, usesCount: 0 })
      } else if (editing) {
        await updateDocById('discounts', editing.id, data)
      }
      close()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette remise ?')) return
    await deleteDocById('discounts', id)
  }

  return (
    <>
      <TopBar
        title="Remises"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : ordered.length === 0 ? (
        <EmptyState icon={Percent} title="Aucune remise" description="Crée un code promo ou attribue un rabais à un client." action={<Button onClick={openCreate}><Plus size={16} />Ajouter une remise</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {ordered.map(d => (
            <DiscountRow key={d.id} d={d} services={services} clients={clients} onEdit={() => openEdit(d)} onDelete={() => handleDelete(d.id)} />
          ))}
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouvelle remise' : 'Modifier la remise'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <FormField label="Type">
              <div className="flex gap-2">
                {(['code', 'client'] as DiscountKind[]).map(k => (
                  <button key={k} type="button" onClick={() => setKind(k)}
                    className="flex-1 h-9 rounded-[var(--radius-md)] border text-[13px] font-medium"
                    style={{ background: kind === k ? 'var(--color-text-primary)' : 'var(--color-surface)', color: kind === k ? '#fff' : 'var(--color-text-primary)', borderColor: kind === k ? 'var(--color-text-primary)' : 'var(--color-border)' }}>
                    {k === 'code' ? 'Code promo' : 'Rabais client'}
                  </button>
                ))}
              </div>
            </FormField>

            {kind === 'code' ? (
              <FormField label="Code" required hint="Le client le saisit lui-même à l'inscription">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ETE2026" />
              </FormField>
            ) : (
              <FormField label="Client" required>
                {selectedClient ? (
                  <button type="button" onClick={() => setClientId('')}
                    className="w-full flex items-center justify-between p-2.5 rounded-[var(--radius-md)] border text-left"
                    style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-accent-subtle)' }}>
                    <span className="text-[13px] text-[var(--color-text-primary)]">{selectedClient.firstName} {selectedClient.lastName}</span>
                    <span className="text-[12px] text-[var(--color-text-tertiary)]">Changer</span>
                  </button>
                ) : (
                  <>
                    <div className="relative mb-1">
                      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#A09890', pointerEvents: 'none' }} />
                      <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Rechercher un client…" style={{ paddingLeft: 32 }} />
                    </div>
                    {filteredClients.map(c => (
                      <button key={c.id} type="button" onClick={() => { setClientId(c.id); setClientSearch('') }}
                        className="w-full flex items-center justify-between p-2 border-b text-left" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="text-[13px] text-[var(--color-text-primary)]">{c.firstName} {c.lastName}</span>
                      </button>
                    ))}
                  </>
                )}
              </FormField>
            )}

            <FormField label="Réduction" required>
              <div className="flex gap-2 mb-2">
                {(['percentage', 'fixed_amount'] as DiscountValueType[]).map(t => (
                  <button key={t} type="button" onClick={() => setDiscountType(t)}
                    className="flex-1 h-9 rounded-[var(--radius-md)] border text-[13px] font-medium"
                    style={{ background: discountType === t ? 'var(--color-text-primary)' : 'var(--color-surface)', color: discountType === t ? '#fff' : 'var(--color-text-primary)', borderColor: discountType === t ? 'var(--color-text-primary)' : 'var(--color-border)' }}>
                    {DISCOUNT_VALUE_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <Input type="number" min="0" step="0.5" value={value} onChange={(e) => setValue(e.target.value)}
                placeholder={discountType === 'percentage' ? '20' : '15'} />
            </FormField>

            <FormField label="Séances concernées">
              <button type="button" onClick={() => setAllPublicServices(v => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left mb-2"
                style={{ background: allPublicServices ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: allPublicServices ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ background: allPublicServices ? 'var(--color-accent)' : 'transparent', border: `2px solid ${allPublicServices ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  {allPublicServices && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Toutes les séances publiques</span>
              </button>
              {!allPublicServices && (
                <div className="space-y-1">
                  <p className="text-[12px] text-[var(--color-text-tertiary)] mb-1">Vide = tous les services</p>
                  {services.map(s => (
                    <button key={s.id} type="button" onClick={() => toggleService(s.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-[var(--radius-md)] border text-left"
                      style={{ background: serviceIds.includes(s.id) ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: serviceIds.includes(s.id) ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                        style={{ background: serviceIds.includes(s.id) ? 'var(--color-accent)' : 'transparent', border: `2px solid ${serviceIds.includes(s.id) ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                        {serviceIds.includes(s.id) && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span className="text-[13px] text-[var(--color-text-primary)]">{s.name}{s.isPublic ? ' · Public' : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </FormField>

            <FormField label="Fenêtre de validité" hint="Optionnel — laisser vide = illimité">
              <div className="flex gap-2">
                <Input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                <Input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
              </div>
            </FormField>

            <FormField label="Limites d'utilisation" hint="Optionnel — laisser vide = illimité">
              <div className="flex gap-2">
                <Input type="number" min="0" value={maxUsesGlobal} onChange={(e) => setMaxUsesGlobal(e.target.value)} placeholder="Total" />
                <Input type="number" min="0" value={maxUsesPerClient} onChange={(e) => setMaxUsesPerClient(e.target.value)} placeholder="Par client" />
              </div>
            </FormField>

            <FormField label="Note interne" hint={kind === 'client' ? 'Affichée au client comme libellé de la remise si renseignée' : 'Optionnel'}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'client' ? 'Remise fidélité' : 'Raison de cette promo'} />
            </FormField>

            <FormField label="Statut">
              <button type="button" onClick={() => setActive(v => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left"
                style={{ background: active ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: active ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ background: active ? 'var(--color-accent)' : 'transparent', border: `2px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  {active && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Active</span>
              </button>
            </FormField>

            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer la remise' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
