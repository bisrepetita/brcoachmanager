'use client'

import { useState } from 'react'
import { orderBy } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc } from '@/lib/services/crud.service'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { SelectNative } from '@/components/ui/select-native'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { ArrowLeft, Plus, FileSignature, ChevronRight, Users } from 'lucide-react'
import type { Convention } from '@/types'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyForm() {
  return {
    title: '', activityLabel: 'coaching de boxe en groupe', dayTimeLabel: '',
    pricePerSession: '', groupSize: '', maxParticipants: '',
    status: 'active' as Convention['status'],
  }
}

export default function ConventionsPage() {
  const router = useRouter()
  const { data: conventions, loading } = useCollection<Convention>('conventions', [orderBy('createdAt', 'desc')])

  const [sheet, setSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  function openCreate() {
    setForm(emptyForm()); setError(null); setSheet(true)
  }
  function close() { setSheet(false) }

  async function handleSave() {
    const pricePerSession = Number(form.pricePerSession)
    const groupSize = Number(form.groupSize)
    const maxParticipants = Number(form.maxParticipants)

    if (!form.title.trim() || !form.dayTimeLabel.trim()) { setError('Le titre et le créneau sont requis.'); return }
    if (!pricePerSession || pricePerSession <= 0) { setError('Le prix par séance doit être positif.'); return }
    if (!groupSize || groupSize <= 0) { setError('Le nombre de participants doit être positif.'); return }
    if (!maxParticipants || maxParticipants < groupSize) { setError('Le maximum doit être supérieur ou égal au nombre nominal.'); return }

    setSaving(true); setError(null)
    try {
      const id = await createDoc('conventions', {
        title: form.title.trim(),
        activityLabel: form.activityLabel.trim() || 'coaching de groupe',
        dayTimeLabel: form.dayTimeLabel.trim(),
        pricePerSession, groupSize, maxParticipants,
        status: form.status,
        version: '1.0',
        versionDate: todayISO(),
        acceptanceCount: 0,
      })
      close()
      router.push(`/admin/conventions/${id}`)
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <>
      <TopBar
        title="Conventions de groupe"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : conventions.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Aucune convention"
          description="Crée une convention pour un groupe (tarif et créneau modifiables), puis partage son lien de signature."
          action={<Button onClick={openCreate}><Plus size={16} />Créer une convention</Button>}
        />
      ) : (
        <div className="p-4 space-y-2">
          {conventions.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/admin/conventions/${c.id}`)}
              className="flex items-center gap-3 p-4 w-full text-left rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <FileSignature size={18} className="shrink-0" style={{ color: '#7A7570' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                  {c.title}
                  {c.status === 'archived' && <span className="ml-2 text-[11px] font-normal text-[var(--color-text-tertiary)]">(archivée)</span>}
                </p>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">
                  {c.dayTimeLabel} · CHF {c.pricePerSession}.- · v{c.version}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[12px]" style={{ color: '#7A7570' }}>
                <Users size={14} />
                {c.acceptanceCount ?? 0}
              </div>
              <ChevronRight size={16} style={{ color: '#C8C4BC' }} />
            </button>
          ))}
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] flex flex-col" style={{ maxHeight: '85dvh', boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
              <h2 className="text-[17px] font-semibold">Nouvelle convention</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 space-y-4 pb-4">
              <FormField label="Titre" required>
                <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="ex. Coaching de groupe — Mardi 17h30" />
              </FormField>
              <FormField label="Activité" hint="Utilisée dans le texte de la convention (clause « Objet »).">
                <Input value={form.activityLabel} onChange={(e) => setForm(f => ({ ...f, activityLabel: e.target.value }))} placeholder="ex. coaching de boxe en groupe" />
              </FormField>
              <FormField label="Créneau" required hint="ex. « tous les mardis à 17h30 »">
                <Input value={form.dayTimeLabel} onChange={(e) => setForm(f => ({ ...f, dayTimeLabel: e.target.value }))} placeholder="tous les mardis à 17h30" />
              </FormField>
              <FormField label="Prix par séance (CHF, groupe entier)" required>
                <Input type="number" min="0" step="0.05" value={form.pricePerSession} onChange={(e) => setForm(f => ({ ...f, pricePerSession: e.target.value }))} placeholder="220" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Participants (nominal)" required>
                  <Input type="number" min="1" value={form.groupSize} onChange={(e) => setForm(f => ({ ...f, groupSize: e.target.value }))} placeholder="7" />
                </FormField>
                <FormField label="Maximum" required>
                  <Input type="number" min="1" value={form.maxParticipants} onChange={(e) => setForm(f => ({ ...f, maxParticipants: e.target.value }))} placeholder="8" />
                </FormField>
              </div>
              <FormField label="Statut">
                <SelectNative value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as Convention['status'] }))}>
                  <option value="active">Active (lien de signature ouvert)</option>
                  <option value="archived">Archivée (lien fermé)</option>
                </SelectNative>
              </FormField>

              {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            </div>

            <div className="px-6 pb-6 pt-3 shrink-0 border-t border-[var(--color-border)]">
              <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
                Créer la convention
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
