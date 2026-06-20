'use client'

import { useState, useMemo } from 'react'
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
import { Plus, ArrowLeft, UsersRound, Pencil, Trash2, Check, Search } from 'lucide-react'
import type { ClientGroup, Client } from '@/types'

export default function GroupsPage() {
  const router = useRouter()
  const { data: groups, loading } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])

  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<ClientGroup | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const filteredClients = useMemo(() =>
    clients.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch]
  )

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

  function openCreate() {
    setEditing(null); setName(''); setNotes(''); setSelectedClientIds([]); setClientSearch(''); setError(null); setSheet('create')
  }
  function openEdit(g: ClientGroup) {
    setEditing(g); setName(g.name); setNotes(g.notes ?? ''); setSelectedClientIds(g.clientIds); setClientSearch(''); setError(null); setSheet('edit')
  }
  function close() { setSheet(null); setEditing(null) }

  function toggleClient(id: string) {
    setSelectedClientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis.'); return }
    setSaving(true); setError(null)
    try {
      if (sheet === 'create') {
        await createDoc('clientGroups', { name: name.trim(), notes, clientIds: selectedClientIds })
      } else if (editing) {
        await updateDocById('clientGroups', editing.id, { name: name.trim(), notes, clientIds: selectedClientIds })
      }
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
                <p className="text-[12px] text-[var(--color-text-tertiary)]">
                  {g.clientIds.length === 0
                    ? 'Aucun client'
                    : g.clientIds.slice(0, 3).map(id => clientMap.get(id)?.firstName).filter(Boolean).join(', ') + (g.clientIds.length > 3 ? ` +${g.clientIds.length - 3}` : '')}
                </p>
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
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] flex flex-col" style={{ maxHeight: '85dvh', boxShadow: 'var(--shadow-sheet)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau groupe' : 'Modifier le groupe'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-6 space-y-4 pb-4">
              <FormField label="Nom du groupe" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Groupe entreprise, Club sportif..." />
              </FormField>
              <FormField label="Notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Informations sur le groupe..." />
              </FormField>

              {/* Clients */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">
                  Clients ({selectedClientIds.length})
                </p>
                <div className="relative mb-2">
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#A09890' }} />
                  <input
                    placeholder="Rechercher…"
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    style={{ height: 36, border: '1px solid #E5E1DA', borderRadius: 8, padding: '0 10px 0 30px', fontSize: 14, color: '#1A1A18', background: '#F9F8F6', outline: 'none', width: '100%' }}
                  />
                </div>
                <div className="space-y-0.5">
                  {filteredClients.map(c => {
                    const sel = selectedClientIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleClient(c.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          textAlign: 'left', width: '100%',
                          backgroundColor: sel ? '#F0EDE8' : 'transparent',
                        }}
                      >
                        <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: sel ? 500 : 400, margin: 0 }}>
                          {c.firstName} {c.lastName}
                        </p>
                        {sel && (
                          <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: '#1A1A18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 }}>
                            <Check size={12} color="#fff" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-3 shrink-0 border-t border-[var(--color-border)]">
              <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
                {sheet === 'create' ? 'Créer le groupe' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
