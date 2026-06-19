'use client'

import { useState } from 'react'
import { orderBy } from 'firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, Briefcase, Pencil, Trash2 } from 'lucide-react'
import type { Service, PricingMode } from '@/types'

const PRICING_OPTIONS: { value: PricingMode; label: string; description: string }[] = [
  { value: 'per_person', label: 'Par personne', description: 'Chaque client paie le prix défini' },
  { value: 'split_between_group', label: 'Partagé', description: 'Le prix est divisé entre les participants' },
]

export default function ServicesPage() {
  const router = useRouter()
  const { data: services, loading } = useCollection<Service>('services', [orderBy('name')])
  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [pricingMode, setPricingMode] = useState<PricingMode>('per_person')
  const [rentalPrice, setRentalPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openCreate() { setEditing(null); setName(''); setPrice(''); setPricingMode('per_person'); setRentalPrice(''); setError(null); setSheet('create') }
  function openEdit(s: Service) {
    setEditing(s); setName(s.name); setPrice(String(s.price)); setPricingMode(s.pricingMode)
    setRentalPrice(String(s.independentRoomRentalPrice)); setError(null); setSheet('edit')
  }
  function close() { setSheet(null); setEditing(null) }

  async function handleSave() {
    if (!name.trim() || !price) { setError('Nom et prix sont requis.'); return }
    setSaving(true); setError(null)
    try {
      const data = {
        name: name.trim(), price: parseFloat(price), pricingMode,
        independentRoomRentalPrice: parseFloat(rentalPrice) || 0, active: true,
      }
      if (sheet === 'create') await createDoc('services', data)
      else if (editing) await updateDocById('services', editing.id, data)
      close()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce service ?')) return
    await deleteDocById('services', id)
  }

  return (
    <>
      <TopBar
        title="Services"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : services.length === 0 ? (
        <EmptyState icon={Briefcase} title="Aucun service" description="Ajoute un type de séance." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un service</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {services.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{s.name}</p>
                  {!s.active && <Badge variant="muted">Inactif</Badge>}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="amount-mono text-[13px] font-semibold text-[var(--color-text-primary)]">CHF {s.price.toFixed(2)}</span>
                  <Badge variant="muted">{s.pricingMode === 'per_person' ? 'Par personne' : 'Partagé'}</Badge>
                  {s.independentRoomRentalPrice > 0 && (
                    <span className="text-[12px] text-[var(--color-text-tertiary)]">Location CHF {s.independentRoomRentalPrice.toFixed(2)}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(s)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-elevated)]">
                  <Pencil size={15} style={{ color: '#7A7570' }} />
                </button>
                <button onClick={() => handleDelete(s.id)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-danger-bg)]">
                  <Trash2 size={15} style={{ color: 'var(--color-danger)' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau service' : 'Modifier le service'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>
            <FormField label="Nom du service" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coaching privé" />
            </FormField>
            <FormField label="Prix (CHF)" required>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="120" min="0" step="0.50" />
            </FormField>
            <FormField label="Mode de tarification">
              <div className="space-y-2">
                {PRICING_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setPricingMode(opt.value)}
                    className="w-full flex items-start gap-3 p-3 rounded-[var(--radius-md)] border text-left transition-colors"
                    style={{ background: pricingMode === opt.value ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: pricingMode === opt.value ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                    <div className="w-4 h-4 rounded-full border-2 mt-0.5 shrink-0"
                      style={{ borderColor: pricingMode === opt.value ? 'var(--color-accent)' : 'var(--color-border)', background: pricingMode === opt.value ? 'var(--color-accent)' : 'transparent' }} />
                    <div>
                      <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{opt.label}</p>
                      <p className="text-[12px] text-[var(--color-text-tertiary)]">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Location salle indépendant (CHF)" hint="Montant dû à Bis Repetita par un coach indépendant">
              <Input type="number" value={rentalPrice} onChange={(e) => setRentalPrice(e.target.value)} placeholder="30" min="0" step="0.50" />
            </FormField>
            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer le service' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
