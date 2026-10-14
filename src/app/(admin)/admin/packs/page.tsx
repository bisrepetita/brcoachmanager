'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { orderBy, deleteField } from 'firebase/firestore'
import { Plus, ArrowLeft, Ticket, Pencil, Trash2 } from 'lucide-react'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import type { PackPlan, SubscriptionDurationUnit, Service } from '@/types'
import { SUBSCRIPTION_DURATION_UNIT_LABELS } from '@/types'

function servicesSummary(plan: PackPlan, services: Service[]): string {
  const names = plan.serviceIds.map(id => services.find(s => s.id === id)?.name).filter(Boolean)
  return names.length > 0 ? names.join(', ') : `${plan.serviceIds.length} service(s)`
}

function CheckRow({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left"
      style={{ background: checked ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: checked ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
        style={{ background: checked ? 'var(--color-accent)' : 'transparent', border: `2px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
        {checked && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
      </div>
      <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{label}</span>
    </button>
  )
}

function PackRow({ plan, services, onEdit, onDelete }: {
  plan: PackPlan; services: Service[]; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">{plan.name}</p>
          {plan.isPublic ? <Badge variant="paid">Public</Badge> : <Badge variant="muted">Caché</Badge>}
          {!plan.active && <Badge variant="cancelled">Inactif</Badge>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="amount-mono text-[13px] font-semibold text-[var(--color-text-primary)]">CHF {plan.price.toFixed(2)}</span>
          <Badge variant="muted">{plan.sessionCount} séances</Badge>
          <Badge variant="muted">valable {plan.validityValue} {SUBSCRIPTION_DURATION_UNIT_LABELS[plan.validityUnit]}</Badge>
          <span className="text-[11px] text-[var(--color-text-tertiary)]">CHF {(plan.price / plan.sessionCount).toFixed(2)} / séance</span>
        </div>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">{servicesSummary(plan, services)}</p>
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

export default function PackPlansPage() {
  const router = useRouter()
  const { data: plans, loading } = useCollection<PackPlan>('packPlans', [])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])

  const ordered = useMemo(() =>
    [...plans].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
  [plans])

  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<PackPlan | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sessionCount, setSessionCount] = useState('10')
  const [price, setPrice] = useState('')
  const [validityValue, setValidityValue] = useState('6')
  const [validityUnit, setValidityUnit] = useState<SubscriptionDurationUnit>('months')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(true)
  const [active, setActive] = useState(true)

  function resetForm() {
    setName(''); setDescription(''); setSessionCount('10'); setPrice('')
    setValidityValue('6'); setValidityUnit('months'); setServiceIds([])
    setIsPublic(true); setActive(true); setError(null)
  }

  function openCreate() { resetForm(); setEditing(null); setSheet('create') }

  function openEdit(plan: PackPlan) {
    setEditing(plan)
    setName(plan.name); setDescription(plan.description ?? '')
    setSessionCount(String(plan.sessionCount)); setPrice(String(plan.price))
    setValidityValue(String(plan.validityValue)); setValidityUnit(plan.validityUnit)
    setServiceIds(plan.serviceIds); setIsPublic(plan.isPublic); setActive(plan.active)
    setError(null)
    setSheet('edit')
  }

  function close() { setSheet(null); setEditing(null) }

  function toggleService(id: string) {
    setServiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const canSubmit = !!(name.trim() && sessionCount && price && validityValue && serviceIds.length > 0)
  const numCount = parseInt(sessionCount, 10)
  const numPrice = parseFloat(price)
  const unitPreview = numCount > 0 && numPrice >= 0 ? numPrice / numCount : null

  async function handleSave() {
    if (!canSubmit) { setError('Renseigne les champs requis.'); return }
    const valVal = parseInt(validityValue, 10)
    if (!numCount || numCount <= 0) { setError('Le nombre de séances doit être positif.'); return }
    if (isNaN(numPrice) || numPrice < 0) { setError('Le prix est invalide.'); return }
    if (!valVal || valVal <= 0) { setError('La durée de validité doit être positive.'); return }
    setSaving(true); setError(null)
    try {
      const data = {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : (sheet === 'edit' ? { description: deleteField() } : {})),
        sessionCount: numCount, price: numPrice,
        validityValue: valVal, validityUnit,
        serviceIds, isPublic, active,
      }
      if (sheet === 'create') {
        await createDoc('packPlans', data)
      } else if (editing) {
        await updateDocById('packPlans', editing.id, data)
      }
      close()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce pack ? Les packs déjà achetés par des clients ne sont pas affectés.')) return
    await deleteDocById('packPlans', id)
  }

  return (
    <>
      <TopBar
        title="Packs de séances"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : ordered.length === 0 ? (
        <EmptyState icon={Ticket} title="Aucun pack" description="Crée un pack (ex. 10 séances valables 6 mois) pour le vendre en ligne ou l'attribuer à un client." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un pack</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {ordered.map(plan => (
            <PackRow key={plan.id} plan={plan} services={services} onEdit={() => openEdit(plan)} onDelete={() => handleDelete(plan.id)} />
          ))}
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau pack' : 'Modifier le pack'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <FormField label="Nom" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pack 10 séances" />
            </FormField>

            <FormField label="Description" hint="Optionnel — visible par le client">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="10 cours collectifs à utiliser quand tu veux" />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nombre de séances" required>
                <Input type="number" min="1" value={sessionCount} onChange={(e) => setSessionCount(e.target.value)} />
              </FormField>
              <FormField label="Prix (CHF)" required hint={unitPreview !== null ? `soit CHF ${unitPreview.toFixed(2)} / séance` : undefined}>
                <Input type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="220" />
              </FormField>
            </div>

            <FormField label="Validité" required hint="À compter de l'achat. Les séances non utilisées à l'expiration sont perdues.">
              <div className="flex gap-2">
                <Input type="number" min="1" value={validityValue} onChange={(e) => setValidityValue(e.target.value)} style={{ maxWidth: 90 }} />
                {(['weeks', 'months'] as SubscriptionDurationUnit[]).map(u => (
                  <button key={u} type="button" onClick={() => setValidityUnit(u)}
                    className="flex-1 h-9 rounded-[var(--radius-md)] border text-[13px] font-medium"
                    style={{ background: validityUnit === u ? 'var(--color-text-primary)' : 'var(--color-surface)', color: validityUnit === u ? '#fff' : 'var(--color-text-primary)', borderColor: validityUnit === u ? 'var(--color-text-primary)' : 'var(--color-border)' }}>
                    {SUBSCRIPTION_DURATION_UNIT_LABELS[u]}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Services couverts" required hint="Séances collectives du Planning sur lesquelles le pack peut être utilisé.">
              <div className="space-y-1">
                {services.map(s => (
                  <CheckRow key={s.id} checked={serviceIds.includes(s.id)} onClick={() => toggleService(s.id)} label={`${s.name}${s.isPublic ? ' · Public' : ''}`} />
                ))}
              </div>
            </FormField>

            <FormField label="Visibilité" hint="Public = le client peut l'acheter lui-même. Caché = attribution manuelle uniquement.">
              <CheckRow checked={isPublic} onClick={() => setIsPublic(v => !v)} label="Visible pour le client (achat en ligne)" />
            </FormField>

            <FormField label="Statut">
              <CheckRow checked={active} onClick={() => setActive(v => !v)} label="Actif" />
            </FormField>

            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer le pack' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
