'use client'

import { useState } from 'react'
import { orderBy } from 'firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, MapPin, Pencil, Trash2 } from 'lucide-react'
import type { Location } from '@/types'

export default function LocationsPage() {
  const router = useRouter()
  const { data: locations, loading } = useCollection<Location>('locations', [orderBy('name')])
  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Location | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openCreate() { setEditing(null); setName(''); setAddress(''); setNotes(''); setError(null); setSheet('create') }
  function openEdit(l: Location) { setEditing(l); setName(l.name); setAddress(l.address ?? ''); setNotes(l.notes ?? ''); setError(null); setSheet('edit') }
  function close() { setSheet(null); setEditing(null) }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis.'); return }
    setSaving(true); setError(null)
    try {
      if (sheet === 'create') await createDoc('locations', { name: name.trim(), address, notes })
      else if (editing) await updateDocById('locations', editing.id, { name: name.trim(), address, notes })
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

      {loading ? <ListSkeleton /> : locations.length === 0 ? (
        <EmptyState icon={MapPin} title="Aucun lieu" description="Ajoute tes salles et lieux d'entraînement." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un lieu</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {locations.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <MapPin size={18} className="shrink-0" style={{ color: '#7A7570' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{l.name}</p>
                {l.address && <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">{l.address}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(l)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-elevated)]">
                  <Pencil size={15} style={{ color: '#7A7570' }} />
                </button>
                <button onClick={() => setConfirmDelete(l.id)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-danger-bg)]">
                  <Trash2 size={15} style={{ color: 'var(--color-danger)' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete */}
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
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4" style={{ boxShadow: 'var(--shadow-sheet)' }}>
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
