'use client'

import { useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, Building2, Pencil, Trash2, X } from 'lucide-react'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { fileToCompressedDataUrl } from '@/lib/utils/image'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import type { Building } from '@/types'

const MAX_PHOTOS = 3

function BuildingRow({ b, onEdit, onDelete }: { b: Building; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <Building2 size={16} className="shrink-0" style={{ color: '#7A7570' }} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{b.name}</p>
        <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">
          {b.accessInstructions ? b.accessInstructions : 'Aucune instruction d\'accès'}
          {b.photos && b.photos.length > 0 ? ` · ${b.photos.length} photo(s)` : ''}
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

export default function BuildingsPage() {
  const router = useRouter()
  const { data: buildings, loading } = useCollection<Building>('buildings', [])

  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Building | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [accessInstructions, setAccessInstructions] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [compressingImage, setCompressingImage] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setEditing(null); setName(''); setAccessInstructions(''); setPhotos([])
    setError(null); setSheet('create')
  }
  function openEdit(b: Building) {
    setEditing(b); setName(b.name); setAccessInstructions(b.accessInstructions ?? ''); setPhotos(b.photos ?? [])
    setError(null); setSheet('edit')
  }
  function close() { setSheet(null); setEditing(null) }

  async function handleAddPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressingImage(true); setError(null)
    try {
      const dataUrl = await fileToCompressedDataUrl(file, { maxDimension: 1000, maxBytes: 250_000 })
      setPhotos(prev => [...prev, dataUrl])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCompressingImage(false)
      e.target.value = ''
    }
  }
  function handleRemovePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis.'); return }
    setSaving(true); setError(null)
    const data = { name: name.trim(), accessInstructions: accessInstructions.trim(), photos }
    try {
      if (sheet === 'create') await createDoc('buildings', data)
      else if (editing) await updateDocById('buildings', editing.id, data)
      close()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await deleteDocById('buildings', id)
    setConfirmDelete(null)
  }

  return (
    <>
      <TopBar
        title="Bâtiments"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : buildings.length === 0 ? (
        <EmptyState icon={Building2} title="Aucun bâtiment" description="Regroupe les Lieux au même endroit pour partager les instructions d'accès avec les clients." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un bâtiment</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {buildings.map(b => (
            <BuildingRow key={b.id} b={b} onEdit={() => openEdit(b)} onDelete={() => setConfirmDelete(b.id)} />
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-[var(--color-surface)] rounded-[var(--radius-card)] p-6 w-full max-w-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h3 className="text-[16px] font-semibold mb-2">Supprimer ce bâtiment ?</h3>
            <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">Les Lieux qui y sont rattachés ne seront plus liés à aucun bâtiment.</p>
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
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau bâtiment' : 'Modifier le bâtiment'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <FormField label="Nom" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Swiss Gun Center" />
            </FormField>

            <FormField label="Instructions d'accès" hint="Affichées au client — entrée, interphone, réception, pièce d'identité...">
              <Textarea
                value={accessInstructions}
                onChange={(e) => setAccessInstructions(e.target.value)}
                placeholder="Sonne à l'interphone 'Swiss Gun Center', la réception te fera descendre et t'accompagnera jusqu'à la salle. Munis-toi de ta pièce d'identité, le bâtiment est sécurisé."
                rows={5}
              />
            </FormField>

            <FormField label="Photos" hint={`Optionnel, jusqu'à ${MAX_PHOTOS} — entrée, interphone, etc.`}>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((url, idx) => (
                  <div key={idx} className="relative rounded-[var(--radius-md)] overflow-hidden aspect-square bg-cover bg-center" style={{ backgroundImage: `url(${url})`, border: '1px solid var(--color-border)' }}>
                    <button type="button" onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                      <X size={11} color="#fff" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <label className="aspect-square rounded-[var(--radius-md)] border border-dashed flex items-center justify-center cursor-pointer text-[11px]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                    {compressingImage ? '...' : '+ Ajouter'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} disabled={compressingImage} />
                  </label>
                )}
              </div>
            </FormField>

            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer le bâtiment' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
