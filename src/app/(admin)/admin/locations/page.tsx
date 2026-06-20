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
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [maxSimultaneous, setMaxSimultaneous] = useState(2)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setEditing(null); setName(''); setAddress(''); setNotes(''); setAllowMultiple(false); setMaxSimultaneous(2); setError(null); setSheet('create')
  }
  function openEdit(l: Location) {
    setEditing(l); setName(l.name); setAddress(l.address ?? ''); setNotes(l.notes ?? '')
    setAllowMultiple(l.allowMultipleBookings ?? false); setMaxSimultaneous(l.maxSimultaneous ?? 2)
    setError(null); setSheet('edit')
  }
  function close() { setSheet(null); setEditing(null) }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis.'); return }
    setSaving(true); setError(null)
    const data = { name: name.trim(), address, notes, allowMultipleBookings: allowMultiple, maxSimultaneous: allowMultiple ? maxSimultaneous : 1 }
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

      {loading ? <ListSkeleton /> : locations.length === 0 ? (
        <EmptyState icon={MapPin} title="Aucun lieu" description="Ajoute tes salles et lieux d'entraînement." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un lieu</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {locations.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <MapPin size={18} className="shrink-0" style={{ color: '#7A7570' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{l.name}</p>
                <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">
                  {l.address ? `${l.address} · ` : ''}
                  {l.allowMultipleBookings ? `${l.maxSimultaneous} max simultanés` : 'Réservation unique'}
                </p>
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

            {/* Multi-réservation */}
            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">Réservations simultanées</p>
              <div className="space-y-2">
                {[
                  { value: false, label: 'Réservation unique', desc: 'Un seul cours à la fois dans ce lieu' },
                  { value: true, label: 'Multi-réservation', desc: 'Plusieurs cours peuvent avoir lieu en même temps' },
                ].map(opt => (
                  <button key={String(opt.value)} onClick={() => setAllowMultiple(opt.value)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-md)] border text-left"
                    style={{ background: allowMultiple === opt.value ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: allowMultiple === opt.value ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                    <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: allowMultiple === opt.value ? 'var(--color-accent)' : 'var(--color-border)', background: allowMultiple === opt.value ? 'var(--color-accent)' : 'transparent' }} />
                    <div>
                      <p className="text-[13px] font-medium">{opt.label}</p>
                      <p className="text-[11px] text-[var(--color-text-tertiary)]">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              {allowMultiple && (
                <div className="mt-3">
                  <FormField label="Nombre maximum simultané">
                    <Input type="number" min={2} max={20} value={maxSimultaneous}
                      onChange={(e) => setMaxSimultaneous(Math.max(2, parseInt(e.target.value) || 2))} />
                  </FormField>
                </div>
              )}
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
