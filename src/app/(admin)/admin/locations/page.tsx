'use client'

import { useState, useEffect } from 'react'
import { writeBatch, doc, deleteField } from 'firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { db } from '@/lib/firebase/firestore'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, MapPin, Pencil, Trash2, GripVertical, Dumbbell, Building2 } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Location, Building } from '@/types'

function SortableRow({ loc, buildingName, onEdit, onDelete }: { loc: Location; buildingName?: string; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loc.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 p-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <button
        {...attributes} {...listeners}
        style={{ touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab', padding: 4, background: 'none', border: 'none', display: 'flex', flexShrink: 0 }}
      >
        <GripVertical size={18} style={{ color: '#C8C4BC' }} />
      </button>
      <MapPin size={16} className="shrink-0" style={{ color: '#7A7570' }} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{loc.name}</p>
        <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">
          {buildingName ? `${buildingName} · ` : ''}
          {loc.address ? `${loc.address} · ` : ''}
          {loc.allowMultipleBookings
            ? loc.maxSimultaneous === 0 ? 'Sans limite' : `${loc.maxSimultaneous} max simultanés`
            : 'Réservation unique'}
          {loc.allowCoachTraining ? ' · Entraînement coach' : ''}
        </p>
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

export default function LocationsPage() {
  const router = useRouter()
  const { data: raw, loading } = useCollection<Location>('locations', [])
  const { data: buildings } = useCollection<Building>('buildings', [])
  const buildingMap = new Map(buildings.map(b => [b.id, b.name]))
  const [ordered, setOrdered] = useState<Location[]>([])

  useEffect(() => {
    if (raw.length === 0) return
    setOrdered([...raw].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name)))
  }, [raw])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  async function saveOrder(items: Location[]) {
    const batch = writeBatch(db)
    items.forEach((item, i) => batch.update(doc(db, 'locations', item.id), { order: i }))
    await batch.commit()
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrdered(prev => {
      const oldIdx = prev.findIndex(i => i.id === active.id)
      const newIdx = prev.findIndex(i => i.id === over.id)
      const next = arrayMove(prev, oldIdx, newIdx)
      saveOrder(next)
      return next
    })
  }

  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Location | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [unlimited, setUnlimited] = useState(false)
  const [maxSimultaneous, setMaxSimultaneous] = useState('')
  const [allowCoachTraining, setAllowCoachTraining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setEditing(null); setName(''); setAddress(''); setNotes(''); setBuildingId('')
    setAllowMultiple(false); setUnlimited(false); setMaxSimultaneous('')
    setAllowCoachTraining(false); setError(null); setSheet('create')
  }
  function openEdit(l: Location) {
    setEditing(l); setName(l.name); setAddress(l.address ?? ''); setNotes(l.notes ?? '')
    setBuildingId(l.buildingId ?? '')
    setAllowMultiple(l.allowMultipleBookings ?? false)
    setUnlimited((l.maxSimultaneous ?? 1) === 0)
    setMaxSimultaneous((l.maxSimultaneous && l.maxSimultaneous > 0) ? String(l.maxSimultaneous) : '')
    setAllowCoachTraining(l.allowCoachTraining ?? false)
    setError(null); setSheet('edit')
  }
  function close() { setSheet(null); setEditing(null) }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis.'); return }
    setSaving(true); setError(null)
    const max = !allowMultiple ? 1 : unlimited ? 0 : (parseInt(maxSimultaneous) || 2)
    const data = {
      name: name.trim(), address, notes,
      ...(buildingId ? { buildingId } : (sheet === 'edit' ? { buildingId: deleteField() } : {})),
      allowMultipleBookings: allowMultiple, maxSimultaneous: max, allowCoachTraining,
    }
    try {
      if (sheet === 'create') await createDoc('locations', data)
      else if (editing) await updateDocById('locations', editing.id, data)
      close()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await deleteDocById('locations', id)
    setConfirmDelete(null)
  }

  return (
    <>
      <TopBar
        title="Lieux"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : ordered.length === 0 ? (
        <EmptyState icon={MapPin} title="Aucun lieu" description="Ajoute tes salles et lieux d'entraînement." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un lieu</Button>} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map(l => l.id)} strategy={verticalListSortingStrategy}>
            <div className="p-4 space-y-2">
              {ordered.map(l => (
                <SortableRow key={l.id} loc={l} buildingName={l.buildingId ? buildingMap.get(l.buildingId) : undefined} onEdit={() => openEdit(l)} onDelete={() => setConfirmDelete(l.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-[var(--color-surface)] rounded-[var(--radius-card)] p-6 w-full max-w-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h3 className="text-[16px] font-semibold mb-2">Supprimer ce lieu ?</h3>
            <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button variant="destructive" className="flex-1" onClick={() => handleDelete(confirmDelete)}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau lieu' : 'Modifier le lieu'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>
            <FormField label="Nom du lieu" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salle principale" />
            </FormField>
            <FormField label="Adresse">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue et numéro, ville" />
            </FormField>
            <FormField label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Accès, code, informations utiles..." />
            </FormField>

            {buildings.length > 0 && (
              <FormField label="Bâtiment" hint="Regroupe ce lieu avec d'autres au même endroit pour partager les instructions d'accès affichées au client">
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setBuildingId('')}
                    className="px-3 py-1.5 rounded-full border text-[12px] font-medium"
                    style={{ background: !buildingId ? '#1A1A18' : 'var(--color-surface)', color: !buildingId ? '#fff' : 'var(--color-text-primary)', borderColor: !buildingId ? '#1A1A18' : 'var(--color-border)' }}>
                    Aucun
                  </button>
                  {buildings.map(b => (
                    <button key={b.id} type="button" onClick={() => setBuildingId(b.id)}
                      className="px-3 py-1.5 rounded-full border text-[12px] font-medium"
                      style={{ background: buildingId === b.id ? '#1A1A18' : 'var(--color-surface)', color: buildingId === b.id ? '#fff' : 'var(--color-text-primary)', borderColor: buildingId === b.id ? '#1A1A18' : 'var(--color-border)' }}>
                      {b.name}
                    </button>
                  ))}
                </div>
              </FormField>
            )}

            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">Réservations simultanées</p>
              <div className="space-y-2">
                {([
                  { val: false, label: 'Réservation unique', desc: 'Un seul cours à la fois dans ce lieu' },
                  { val: true, label: 'Multi-réservation', desc: 'Plusieurs cours peuvent avoir lieu en même temps' },
                ] as const).map(opt => (
                  <button key={String(opt.val)} onClick={() => setAllowMultiple(opt.val)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-md)] border text-left"
                    style={{ background: allowMultiple === opt.val ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: allowMultiple === opt.val ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                    <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: allowMultiple === opt.val ? 'var(--color-accent)' : 'var(--color-border)', background: allowMultiple === opt.val ? 'var(--color-accent)' : 'transparent' }} />
                    <div>
                      <p className="text-[13px] font-medium">{opt.label}</p>
                      <p className="text-[11px] text-[var(--color-text-tertiary)]">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              {allowMultiple && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    {([{ val: false, label: 'Avec limite' }, { val: true, label: 'Sans limite' }] as const).map(opt => (
                      <button key={String(opt.val)} onClick={() => setUnlimited(opt.val)}
                        className="flex-1 py-2 rounded-[var(--radius-md)] border text-[13px] font-medium"
                        style={{ background: unlimited === opt.val ? '#1A1A18' : 'transparent', color: unlimited === opt.val ? '#fff' : '#1A1A18', borderColor: unlimited === opt.val ? '#1A1A18' : '#E5E1DA' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {!unlimited && (
                    <FormField label="Nombre maximum simultané">
                      <Input type="number" min={2} placeholder="ex. 3" value={maxSimultaneous} onChange={(e) => setMaxSimultaneous(e.target.value)} />
                    </FormField>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">Entraînement coach</p>
              <button onClick={() => setAllowCoachTraining(v => !v)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-md)] border text-left"
                style={{ background: allowCoachTraining ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: allowCoachTraining ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <Dumbbell size={16} style={{ color: allowCoachTraining ? '#1A1A18' : '#A09890', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">Disponible pour l&apos;entraînement des coachs</p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">Les coachs pourront réserver ce lieu sans client ni service</p>
                </div>
                <div className="w-4 h-4 rounded shrink-0 flex items-center justify-center" style={{ background: allowCoachTraining ? '#1A1A18' : 'transparent', border: allowCoachTraining ? 'none' : '1.5px solid #C8C4BC' }}>
                  {allowCoachTraining && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 2.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
              </button>
            </div>

            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer le lieu' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
