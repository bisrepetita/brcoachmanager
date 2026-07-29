'use client'

import { useState, useEffect, type ChangeEvent } from 'react'
import { writeBatch, doc, collection, query, where, limit, getDocs } from 'firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { fileToCompressedDataUrl } from '@/lib/utils/image'
import { db } from '@/lib/firebase/firestore'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, Briefcase, Pencil, Trash2, GripVertical, ImagePlus, X } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Service, PricingMode, User } from '@/types'

const PRICING_OPTIONS: { value: PricingMode; label: string; description: string }[] = [
  { value: 'per_person', label: 'Par personne', description: 'Chaque client paie le prix défini' },
  { value: 'split_between_group', label: 'Partagé', description: 'Le prix est divisé entre les participants' },
]

function SortableServiceRow({ s, coaches, onEdit, onDelete }: { s: Service; coaches: User[]; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id })
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
      {s.imageUrl ? (
        <div className="w-10 h-10 rounded-[var(--radius-md)] shrink-0 bg-cover bg-center" style={{ backgroundImage: `url(${s.imageUrl})` }} />
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">{s.name}</p>
          {!s.active && <Badge variant="muted">Inactif</Badge>}
          {s.isPublic && <Badge variant="paid">Public</Badge>}
          {s.firstBookingFree && <Badge variant="gold">1ère offerte</Badge>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="amount-mono text-[13px] font-semibold text-[var(--color-text-primary)]">CHF {s.price.toFixed(2)}</span>
          <Badge variant="muted">{s.pricingMode === 'per_person' ? 'Par personne' : 'Partagé'}</Badge>
          {s.independentRoomRentalPrice > 0 && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">Loc. CHF {s.independentRoomRentalPrice.toFixed(2)}</span>
          )}
        </div>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
          {!s.assignedCoachIds || s.assignedCoachIds.length === 0
            ? 'Tous les coachs'
            : s.assignedCoachIds.map(id => coaches.find(c => c.id === id)?.firstName ?? '').filter(Boolean).join(', ')}
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

export default function ServicesPage() {
  const router = useRouter()
  const { data: raw, loading } = useCollection<Service>('services', [])
  const { data: coaches } = useCollection<User>('users', [where('roles', 'array-contains', 'coach')])
  const [ordered, setOrdered] = useState<Service[]>([])

  useEffect(() => {
    if (raw.length === 0) return
    setOrdered([...raw].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name)))
  }, [raw])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  async function saveOrder(items: Service[]) {
    const batch = writeBatch(db)
    items.forEach((item, i) => batch.update(doc(db, 'services', item.id), { order: i }))
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
  const [editing, setEditing] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [pricingMode, setPricingMode] = useState<PricingMode>('per_person')
  const [rentalPrice, setRentalPrice] = useState('')
  const [assignedCoachIds, setAssignedCoachIds] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [firstBookingFree, setFirstBookingFree] = useState(false)
  const [active, setActive] = useState(true)
  const [imageValue, setImageValue] = useState('')
  const [compressingImage, setCompressingImage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function openCreate() {
    setEditing(null); setName(''); setPrice(''); setPricingMode('per_person')
    setRentalPrice(''); setAssignedCoachIds([]); setIsPublic(false); setFirstBookingFree(false)
    setActive(true); setImageValue('')
    setError(null); setSheet('create')
  }
  function openEdit(s: Service) {
    setEditing(s); setName(s.name); setPrice(String(s.price)); setPricingMode(s.pricingMode)
    setRentalPrice(String(s.independentRoomRentalPrice))
    setAssignedCoachIds(s.assignedCoachIds ?? []); setIsPublic(s.isPublic ?? false)
    setFirstBookingFree(s.firstBookingFree ?? false); setActive(s.active !== false)
    setImageValue(s.imageUrl ?? '')
    setError(null); setSheet('edit')
  }
  function close() { setSheet(null); setEditing(null) }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressingImage(true); setError(null)
    try {
      setImageValue(await fileToCompressedDataUrl(file, { aspectRatio: 2.5 }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCompressingImage(false)
    }
  }
  function handleImageRemove() {
    setImageValue('')
  }

  function toggleCoach(coachId: string) {
    setAssignedCoachIds(prev =>
      prev.includes(coachId) ? prev.filter(id => id !== coachId) : [...prev, coachId]
    )
  }

  async function handleSave() {
    if (!name.trim() || !price) { setError('Nom et prix sont requis.'); return }
    setSaving(true); setError(null)
    try {
      const data = {
        name: name.trim(), price: parseFloat(price), pricingMode,
        independentRoomRentalPrice: parseFloat(rentalPrice) || 0, active,
        assignedCoachIds, isPublic, firstBookingFree, imageUrl: imageValue,
      }
      if (sheet === 'create') await createDoc('services', data)
      else if (editing) await updateDocById('services', editing.id, data)
      close()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    setDeleteError(null)
    const [plannedSessions, plannedGroupSessions, recurrences, groupSessionRecurrences] = await Promise.all([
      getDocs(query(collection(db, 'sessions'), where('serviceId', '==', id), where('status', '==', 'planned'), limit(1))),
      getDocs(query(collection(db, 'groupSessions'), where('serviceId', '==', id), where('status', '==', 'planned'), limit(1))),
      getDocs(query(collection(db, 'recurrences'), where('serviceId', '==', id), limit(1))),
      getDocs(query(collection(db, 'groupSessionRecurrences'), where('serviceId', '==', id), limit(1))),
    ])
    if (!plannedSessions.empty || !plannedGroupSessions.empty || !recurrences.empty || !groupSessionRecurrences.empty) {
      setDeleteError('Ce service est encore utilisé par des séances à venir ou une récurrence active — impossible de le supprimer. Désactive-le plutôt (bouton crayon → Service actif) : il disparaît des nouvelles créations sans casser l\'historique.')
      return
    }
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

      {deleteError && (
        <div className="mx-4 mt-3 p-3 rounded-[var(--radius-md)] flex items-start justify-between gap-3" style={{ background: '#FFF4E5', color: '#B26A00' }}>
          <p className="text-[13px]">{deleteError}</p>
          <button onClick={() => setDeleteError(null)} className="text-[13px] font-semibold shrink-0">✕</button>
        </div>
      )}

      {loading ? <ListSkeleton /> : ordered.length === 0 ? (
        <EmptyState icon={Briefcase} title="Aucun service" description="Ajoute un type de séance." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un service</Button>} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="p-4 space-y-2">
              {ordered.map(s => (
                <SortableServiceRow key={s.id} s={s} coaches={coaches} onEdit={() => openEdit(s)} onDelete={() => handleDelete(s.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
            <FormField label="Statut" hint="Un service inactif disparaît des nouvelles créations mais reste visible sur l'historique existant — préférable à la suppression si le service est encore utilisé">
              <button type="button" onClick={() => setActive(v => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left transition-colors"
                style={{ background: active ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: active ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ background: active ? 'var(--color-accent)' : 'transparent', border: `2px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  {active && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Service actif</span>
              </button>
            </FormField>
            <FormField label="Image de fond" hint="Affichée en fond sombre sur la carte du service dans le Planning client — compressée automatiquement, aucun coût d'hébergement">
              <div className="rounded-[var(--radius-md)] overflow-hidden relative h-28 flex items-end p-3"
                style={{
                  background: imageValue
                    ? `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.65)), url(${imageValue}) center/100% auto no-repeat`
                    : 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                }}>
                {compressingImage ? (
                  <span className="text-[12px] w-full text-center" style={{ color: imageValue ? '#fff' : '#A09890' }}>Compression en cours…</span>
                ) : imageValue ? (
                  <>
                    <span className="text-[13px] font-semibold text-white">{name || 'Aperçu'}</span>
                    <button type="button" onClick={handleImageRemove}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.5)' }}>
                      <X size={13} color="#fff" />
                    </button>
                  </>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer m-[-12px]">
                    <ImagePlus size={20} style={{ color: '#A09890' }} />
                    <span className="text-[12px]" style={{ color: '#A09890' }}>Choisir une image</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                )}
              </div>
              {imageValue && !compressingImage && (
                <label className="inline-block mt-2 text-[12px] font-medium cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                  Changer l&apos;image
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              )}
            </FormField>
            <FormField label="Visibilité" hint="Un service public apparaît dans le Planning des clients (auto-inscription + paiement en ligne)">
              <button type="button" onClick={() => setIsPublic(v => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left transition-colors"
                style={{ background: isPublic ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: isPublic ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ background: isPublic ? 'var(--color-accent)' : 'transparent', border: `2px solid ${isPublic ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  {isPublic && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Service public</span>
              </button>
            </FormField>
            <FormField label="Offre de bienvenue" hint="Gratuit pour un client qui n'a encore jamais fait de réservation avec son compte — une seule fois, tous services confondus">
              <button type="button" onClick={() => setFirstBookingFree(v => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left transition-colors"
                style={{ background: firstBookingFree ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: firstBookingFree ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                  style={{ background: firstBookingFree ? 'var(--color-accent)' : 'transparent', border: `2px solid ${firstBookingFree ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  {firstBookingFree && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Première réservation offerte</span>
              </button>
            </FormField>
            <FormField label="Coachs autorisés" hint="Laisser vide = tous les coachs peuvent proposer ce service">
              <div className="space-y-1">
                {coaches.map(c => (
                  <button key={c.id} type="button" onClick={() => toggleCoach(c.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-[var(--radius-md)] border text-left"
                    style={{ background: assignedCoachIds.includes(c.id) ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: assignedCoachIds.includes(c.id) ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                      style={{ background: assignedCoachIds.includes(c.id) ? 'var(--color-accent)' : 'transparent', border: `2px solid ${assignedCoachIds.includes(c.id) ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                      {assignedCoachIds.includes(c.id) && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span className="text-[13px] text-[var(--color-text-primary)]">{c.firstName} {c.lastName}</span>
                  </button>
                ))}
              </div>
            </FormField>
            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving} disabled={compressingImage}>
              {sheet === 'create' ? 'Créer le service' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
