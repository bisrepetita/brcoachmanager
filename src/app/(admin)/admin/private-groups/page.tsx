'use client'

import { useState } from 'react'
import { orderBy } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc } from '@/lib/services/crud.service'
import { generatePrivateGroupToken } from '@/lib/utils/private-group-token'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { ArrowLeft, Plus, Building, ChevronRight } from 'lucide-react'
import { PrivateGroupForm, emptyPrivateGroupForm, parsePrivateGroupForm } from './PrivateGroupForm'
import type { PrivateGroup } from '@/types'

export default function PrivateGroupsPage() {
  const router = useRouter()
  const { data: groups, loading } = useCollection<PrivateGroup>('privateGroups', [orderBy('name')])

  const [sheet, setSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPrivateGroupForm())

  function openCreate() {
    setForm(emptyPrivateGroupForm()); setError(null); setSheet(true)
  }

  async function handleSave() {
    const parsed = parsePrivateGroupForm(form)
    if ('error' in parsed) { setError(parsed.error); return }
    setSaving(true); setError(null)
    try {
      const id = await createDoc('privateGroups', { ...parsed.data, token: generatePrivateGroupToken(), active: true })
      setSheet(false)
      router.push(`/admin/private-groups/${id}`)
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <>
      <TopBar
        title="Groupes privés"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : groups.length === 0 ? (
        <EmptyState
          icon={Building}
          title="Aucun groupe privé"
          description="Crée un groupe (ex. une société qui paie les séances de ses employés), puis partage son lien : seuls ses membres verront ses séances."
          action={<Button onClick={openCreate}><Plus size={16} />Créer un groupe</Button>}
        />
      ) : (
        <div className="p-4 space-y-2">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => router.push(`/admin/private-groups/${g.id}`)}
              className="flex items-center gap-3 p-4 w-full text-left rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <Building size={18} className="shrink-0" style={{ color: '#7A7570' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                  {g.name}
                  {!g.active && <span className="ml-2 text-[11px] font-normal text-[var(--color-text-tertiary)]">(archivé)</span>}
                </p>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">
                  Société CHF {g.sponsorAmountPerSession}.- / séance · Participation CHF {g.participantPrice}.-
                </p>
              </div>
              <ChevronRight size={16} style={{ color: '#C8C4BC' }} />
            </button>
          ))}
        </div>
      )}

      {sheet && (
        <PrivateGroupForm
          title="Nouveau groupe privé"
          submitLabel="Créer le groupe"
          form={form} setForm={setForm} error={error} saving={saving}
          onSubmit={handleSave} onClose={() => setSheet(false)}
        />
      )}
    </>
  )
}
