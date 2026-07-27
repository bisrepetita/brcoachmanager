'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { orderBy, deleteField } from 'firebase/firestore'
import { Plus, ArrowLeft, Repeat, Pencil, Trash2 } from 'lucide-react'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import type { SubscriptionPlan, SubscriptionDurationUnit, Service } from '@/types'
import { SUBSCRIPTION_DURATION_UNIT_LABELS, DAY_OF_WEEK_LABELS } from '@/types'

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] // Lundi -> Dimanche pour l'affichage, valeur stockée en convention JS

function servicesSummary(plan: SubscriptionPlan, services: Service[]): string {
  const names = plan.serviceIds.map(id => services.find(s => s.id === id)?.name).filter(Boolean)
  return names.length > 0 ? names.join(', ') : `${plan.serviceIds.length} service(s)`
}

function PlanRow({ plan, services, onEdit, onDelete }: {
  plan: SubscriptionPlan; services: Service[]; onEdit: () => void; onDelete: () => void
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
          <Badge variant="muted">{plan.durationValue} {SUBSCRIPTION_DURATION_UNIT_LABELS[plan.durationUnit]}</Badge>
          <Badge variant="muted">{plan.sessionsPerWeek}x/semaine</Badge>
          {plan.fixedSlot && (
            <Badge variant="muted">{DAY_OF_WEEK_LABELS[plan.fixedSlot.dayOfWeek]} {plan.fixedSlot.startTime}</Badge>
          )}
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

export default function SubscriptionPlansPage() {
  const router = useRouter()
  const { data: plans, loading } = useCollection<SubscriptionPlan>('subscriptionPlans', [])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])

  const ordered = useMemo(() =>
    [...plans].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
  [plans])

  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [durationValue, setDurationValue] = useState('1')
  const [durationUnit, setDurationUnit] = useState<SubscriptionDurationUnit>('months')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [sessionsPerWeek, setSessionsPerWeek] = useState('1')
  const [fixedSlotEnabled, setFixedSlotEnabled] = useState(false)
  const [fixedDayOfWeek, setFixedDayOfWeek] = useState(1)
  const [fixedStartTime, setFixedStartTime] = useState('18:30')
  const [fixedServiceId, setFixedServiceId] = useState('')
  const [price, setPrice] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [active, setActive] = useState(true)

  function resetForm() {
    setName(''); setDescription(''); setDurationValue('1'); setDurationUnit('months')
    setServiceIds([]); setSessionsPerWeek('1')
    setFixedSlotEnabled(false); setFixedDayOfWeek(1); setFixedStartTime('18:30'); setFixedServiceId('')
    setPrice(''); setIsPublic(true); setActive(true); setError(null)
  }

  function openCreate() { resetForm(); setEditing(null); setSheet('create') }

  function openEdit(plan: SubscriptionPlan) {
    setEditing(plan)
    setName(plan.name); setDescription(plan.description ?? '')
    setDurationValue(String(plan.durationValue)); setDurationUnit(plan.durationUnit)
    setServiceIds(plan.serviceIds); setSessionsPerWeek(String(plan.sessionsPerWeek))
    setFixedSlotEnabled(!!plan.fixedSlot)
    setFixedDayOfWeek(plan.fixedSlot?.dayOfWeek ?? 1)
    setFixedStartTime(plan.fixedSlot?.startTime ?? '18:30')
    setFixedServiceId(plan.fixedSlot?.serviceId ?? '')
    setPrice(String(plan.price)); setIsPublic(plan.isPublic); setActive(plan.active)
    setError(null)
    setSheet('edit')
  }

  function close() { setSheet(null); setEditing(null) }

  function toggleService(id: string) {
    setServiceIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      if (fixedServiceId && !next.includes(fixedServiceId)) setFixedServiceId('')
      return next
    })
  }

  function toggleFixedSlot(v: boolean) {
    setFixedSlotEnabled(v)
    if (v) {
      setSessionsPerWeek('1')
      if (!fixedServiceId && serviceIds.length === 1) setFixedServiceId(serviceIds[0]!)
    }
  }

  const canSubmit = !!(
    name.trim() && durationValue && serviceIds.length > 0 && sessionsPerWeek && price &&
    (!fixedSlotEnabled || fixedServiceId)
  )

  async function handleSave() {
    if (!canSubmit) { setError('Renseigne les champs requis.'); return }
    const durVal = parseInt(durationValue, 10)
    const perWeek = fixedSlotEnabled ? 1 : parseInt(sessionsPerWeek, 10)
    const numPrice = parseFloat(price)
    if (!durVal || durVal <= 0) { setError('La durée doit être positive.'); return }
    if (!perWeek || perWeek <= 0) { setError('Le nombre de séances par semaine doit être positif.'); return }
    if (isNaN(numPrice) || numPrice < 0) { setError('Le prix est invalide.'); return }
    setSaving(true); setError(null)
    try {
      const data = {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        durationValue: durVal, durationUnit,
        serviceIds, sessionsPerWeek: perWeek,
        ...(fixedSlotEnabled
          ? { fixedSlot: { dayOfWeek: fixedDayOfWeek, startTime: fixedStartTime, serviceId: fixedServiceId } }
          : (sheet === 'edit' ? { fixedSlot: deleteField() } : {})),
        price: numPrice, isPublic, active,
      }
      if (sheet === 'create') {
        await createDoc('subscriptionPlans', data)
      } else if (editing) {
        await updateDocById('subscriptionPlans', editing.id, data)
      }
      close()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce plan d\'abonnement ?')) return
    await deleteDocById('subscriptionPlans', id)
  }

  return (
    <>
      <TopBar
        title="Abonnements"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : ordered.length === 0 ? (
        <EmptyState icon={Repeat} title="Aucun plan d'abonnement" description="Crée un plan pour l'attribuer à des clients ou le vendre en ligne." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un plan</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {ordered.map(plan => (
            <PlanRow key={plan.id} plan={plan} services={services} onEdit={() => openEdit(plan)} onDelete={() => handleDelete(plan.id)} />
          ))}
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau plan' : 'Modifier le plan'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <FormField label="Nom" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Round by Round hebdo" />
            </FormField>

            <FormField label="Description" hint="Optionnel — visible par le client en self-service">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="1 séance de Round by Round par semaine" />
            </FormField>

            <FormField label="Durée" required>
              <div className="flex gap-2">
                <Input type="number" min="1" value={durationValue} onChange={(e) => setDurationValue(e.target.value)} style={{ maxWidth: 90 }} />
                {(['weeks', 'months'] as SubscriptionDurationUnit[]).map(u => (
                  <button key={u} type="button" onClick={() => setDurationUnit(u)}
                    className="flex-1 h-9 rounded-[var(--radius-md)] border text-[13px] font-medium"
                    style={{ background: durationUnit === u ? 'var(--color-text-primary)' : 'var(--color-surface)', color: durationUnit === u ? '#fff' : 'var(--color-text-primary)', borderColor: durationUnit === u ? 'var(--color-text-primary)' : 'var(--color-border)' }}>
                    {SUBSCRIPTION_DURATION_UNIT_LABELS[u]}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Services couverts" required>
              <div className="space-y-1">
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
            </FormField>

            <FormField label="Séances par semaine" required hint={fixedSlotEnabled ? 'Verrouillé à 1 tant que le créneau fixe est activé' : undefined}>
              <Input type="number" min="1" value={sessionsPerWeek} disabled={fixedSlotEnabled}
                onChange={(e) => setSessionsPerWeek(e.target.value)} style={{ maxWidth: 90 }} />
            </FormField>

            <FormField label="Créneau fixe" hint="Optionnel — restreint le plan à un jour et une heure précis (ex: uniquement le mercredi 18h30), plutôt que n'importe quelle occurrence du service dans la semaine">
              <button type="button" onClick={() => toggleFixedSlot(!fixedSlotEnabled)}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left mb-2"
                style={{ background: fixedSlotEnabled ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: fixedSlotEnabled ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ background: fixedSlotEnabled ? 'var(--color-accent)' : 'transparent', border: `2px solid ${fixedSlotEnabled ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  {fixedSlotEnabled && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Restreindre à un créneau fixe</span>
              </button>

              {fixedSlotEnabled && (
                <div className="space-y-2">
                  <div className="flex gap-1 flex-wrap">
                    {WEEK_DAYS.map(d => (
                      <button key={d} type="button" onClick={() => setFixedDayOfWeek(d)}
                        className="px-3 h-9 rounded-[var(--radius-md)] border text-[12px] font-medium"
                        style={{ background: fixedDayOfWeek === d ? 'var(--color-text-primary)' : 'var(--color-surface)', color: fixedDayOfWeek === d ? '#fff' : 'var(--color-text-primary)', borderColor: fixedDayOfWeek === d ? 'var(--color-text-primary)' : 'var(--color-border)' }}>
                        {DAY_OF_WEEK_LABELS[d]!.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <Input type="time" value={fixedStartTime} onChange={(e) => setFixedStartTime(e.target.value)} style={{ maxWidth: 140 }} />
                  {serviceIds.length > 1 && (
                    <div className="space-y-1">
                      <p className="text-[12px] text-[var(--color-text-tertiary)]">Quel service pour ce créneau ?</p>
                      {serviceIds.map(id => {
                        const s = services.find(sv => sv.id === id)
                        if (!s) return null
                        return (
                          <button key={id} type="button" onClick={() => setFixedServiceId(id)}
                            className="w-full flex items-center gap-3 p-2 rounded-[var(--radius-md)] border text-left"
                            style={{ background: fixedServiceId === id ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: fixedServiceId === id ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                            <span className="text-[13px] text-[var(--color-text-primary)]">{s.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </FormField>

            <FormField label="Prix (CHF)" required>
              <Input type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="80" />
            </FormField>

            <FormField label="Visibilité" hint="Public = le client peut l'acheter lui-même. Caché = attribution manuelle uniquement.">
              <button type="button" onClick={() => setIsPublic(v => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left"
                style={{ background: isPublic ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: isPublic ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ background: isPublic ? 'var(--color-accent)' : 'transparent', border: `2px solid ${isPublic ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  {isPublic && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Visible pour le client (self-service)</span>
              </button>
            </FormField>

            <FormField label="Statut">
              <button type="button" onClick={() => setActive(v => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left"
                style={{ background: active ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: active ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ background: active ? 'var(--color-accent)' : 'transparent', border: `2px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  {active && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Actif</span>
              </button>
            </FormField>

            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer le plan' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
