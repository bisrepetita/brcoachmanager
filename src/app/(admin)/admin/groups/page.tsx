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
import { Plus, ArrowLeft, UsersRound, Pencil, Trash2 } from 'lucide-react'
import type { ClientGroup } from '@/types'

export default function GroupsPage() {
  const router = useRouter()
  const { data: groups, loading } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])
  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<ClientGroup | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openCreate() { setEditing(null); setName(''); setNotes(''); setError(null); setSheet('create') }
  function openEdit(g: ClientGroup) { setEditing(g); setName(g.name); setNotes(g.notes ?? ''); setError(null); setSheet('edit') }
  function close() { setSheet(null); setEditing(null) }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis.'); return }
    setSaving(true); setError(null)
    try {
      if (sheet === 'create') await createDoc('clientGroups', { name: name.trim(), notes, clientIds: [] })
      else if (editing) await updateDocById('clientGroups', editing.id, { name: name.trim(), notes })
      close()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce groupe ?')) return
    await deleteDocById('clientGroups', id)
  }

  return (
    <>
      <TopBar
        title="Groupes clients"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : groups.length === 0 ? (
        <EmptyState icon={UsersRound} title="Aucun groupe" description="Crée un groupe pour ajouter plusieurs clients à une séance d'un coup." action={<Button onClick={openCreate}><Plus size={16} />Créer un groupe</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-3 p-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <UsersRound size={18} className="shrink-0" style={{ color: '#7A7570' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{g.name}</p>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">{g.clientIds.length} client{g.clientIds.length > 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(g)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-elevated)]">
                  <Pencil size={15} style={{ color: '#7A7570' }} />
                </button>
                <button onClick={() => handleDelete(g.id)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-danger-bg)]">
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
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau groupe' : 'Modifier le groupe'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>
            <FormField label="Nom du groupe" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Groupe entreprise Addax" />
            </FormField>
            <FormField label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Informations sur le groupe..." />
            </FormField>
            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer le groupe' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
