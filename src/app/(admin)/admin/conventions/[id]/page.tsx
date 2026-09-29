'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot, orderBy } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, Copy, Check, MessageCircle, Archive, ArchiveRestore, Trash2, Pencil, Users } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { SelectNative } from '@/components/ui/select-native'
import { EmptyState } from '@/components/shared/EmptyState'
import type { Convention, ConventionAcceptance } from '@/types'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function bumpVersion(version: string): string {
  const n = Number.parseFloat(version)
  if (Number.isNaN(n)) return '1.1'
  return (n + 0.1).toFixed(1)
}

const LEGAL_FIELDS = ['activityLabel', 'dayTimeLabel', 'pricePerSession', 'groupSize', 'maxParticipants'] as const

export default function ConventionDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const conventionId = params.id

  const [convention, setConvention] = useState<Convention | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const [sheet, setSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '', activityLabel: '', dayTimeLabel: '',
    pricePerSession: '', groupSize: '', maxParticipants: '',
    status: 'active' as Convention['status'],
  })

  const { data: acceptances, loading: loadingAcceptances } = useCollection<ConventionAcceptance>(
    `conventions/${conventionId}/acceptances`, [orderBy('acceptedAt', 'desc')]
  )

  useEffect(() => {
    return onSnapshot(doc(db, 'conventions', conventionId), (snap) => {
      setConvention(snap.exists() ? ({ id: snap.id, ...snap.data() } as Convention) : null)
      setLoading(false)
    }, () => setLoading(false))
  }, [conventionId])

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/convention/${conventionId}` : ''

  function openEdit() {
    if (!convention) return
    setForm({
      title: convention.title,
      activityLabel: convention.activityLabel,
      dayTimeLabel: convention.dayTimeLabel,
      pricePerSession: String(convention.pricePerSession),
      groupSize: String(convention.groupSize),
      maxParticipants: String(convention.maxParticipants),
      status: convention.status,
    })
    setError(null)
    setSheet(true)
  }

  async function handleSave() {
    if (!convention) return
    const pricePerSession = Number(form.pricePerSession)
    const groupSize = Number(form.groupSize)
    const maxParticipants = Number(form.maxParticipants)

    if (!form.title.trim() || !form.dayTimeLabel.trim()) { setError('Le titre et le créneau sont requis.'); return }
    if (!pricePerSession || pricePerSession <= 0) { setError('Le prix par séance doit être positif.'); return }
    if (!groupSize || groupSize <= 0) { setError('Le nombre de participants doit être positif.'); return }
    if (!maxParticipants || maxParticipants < groupSize) { setError('Le maximum doit être supérieur ou égal au nombre nominal.'); return }

    const next = {
      title: form.title.trim(),
      activityLabel: form.activityLabel.trim() || 'coaching de groupe',
      dayTimeLabel: form.dayTimeLabel.trim(),
      pricePerSession, groupSize, maxParticipants,
      status: form.status,
    }

    const legalChanged = convention.acceptanceCount > 0 && LEGAL_FIELDS.some(
      (key) => String(convention[key]) !== String(next[key as keyof typeof next])
    )

    setSaving(true); setError(null)
    try {
      await updateDocById('conventions', convention.id, {
        ...next,
        ...(legalChanged ? { version: bumpVersion(convention.version), versionDate: todayISO() } : {}),
      })
      setSheet(false)
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  async function toggleArchive() {
    if (!convention) return
    await updateDocById('conventions', convention.id, { status: convention.status === 'active' ? 'archived' : 'active' })
  }

  async function handleDelete() {
    if (!convention) return
    if (!confirm('Supprimer cette convention et son lien de signature ? Les acceptations déjà enregistrées seront conservées mais ne seront plus rattachables depuis cette page.')) return
    await deleteDocById('conventions', convention.id)
    router.push('/admin/conventions')
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function shareWhatsApp() {
    const text = `Bonjour, voici le lien pour remplir et accepter la convention "${convention?.title}" : ${publicUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  if (loading) return <><TopBar title="Convention" left={<button onClick={() => router.back()}><ChevronLeft size={20} /></button>} /><TopBarSpacer /></>
  if (!convention) return <><TopBar title="Convention" left={<button onClick={() => router.back()}><ChevronLeft size={20} /></button>} /><TopBarSpacer /><EmptyState icon={Users} title="Convention introuvable" /></>

  return (
    <>
      <TopBar
        title={convention.title}
        left={<button onClick={() => router.back()}><ChevronLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<button onClick={openEdit} className="p-2"><Pencil size={18} style={{ color: '#7A7570' }} /></button>}
      />
      <TopBarSpacer />

      <div className="p-4 space-y-4">
        {/* Résumé */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-1">
          <p className="text-[12px] text-[var(--color-text-tertiary)]">{convention.activityLabel} · {convention.dayTimeLabel}</p>
          <p className="text-[15px] font-medium text-[var(--color-text-primary)]">
            CHF {convention.pricePerSession}.- / séance · {convention.groupSize} participants (max {convention.maxParticipants})
          </p>
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
            Version {convention.version} du {convention.versionDate} · {convention.status === 'active' ? 'Active' : 'Archivée'} · {convention.acceptanceCount ?? 0} signature{(convention.acceptanceCount ?? 0) > 1 ? 's' : ''}
          </p>
        </div>

        {/* Lien de signature */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
          <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Lien à envoyer</p>
          <div className="flex items-center gap-2">
            <Input value={publicUrl} readOnly onFocus={(e) => e.target.select()} className="text-[12px]" />
            <Button size="icon" variant="secondary" onClick={copyLink}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
          </div>
          <Button size="md" variant="secondary" className="w-full" onClick={shareWhatsApp}>
            <MessageCircle size={16} />
            Partager par WhatsApp
          </Button>
          {convention.status !== 'active' && (
            <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>Convention archivée — le lien n&apos;accepte plus de nouvelles signatures.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="md" variant="secondary" className="flex-1" onClick={toggleArchive}>
            {convention.status === 'active' ? <Archive size={16} /> : <ArchiveRestore size={16} />}
            {convention.status === 'active' ? 'Archiver' : 'Réactiver'}
          </Button>
          <Button size="md" variant="destructive" onClick={handleDelete}>
            <Trash2 size={16} />
          </Button>
        </div>

        {/* Acceptations */}
        <div>
          <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">
            Signatures ({acceptances.length})
          </p>
          {loadingAcceptances ? (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Chargement…</p>
          ) : acceptances.length === 0 ? (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Personne n&apos;a encore signé cette convention.</p>
          ) : (
            <div className="space-y-2">
              {acceptances.map((a) => (
                <button
                  key={a.id}
                  onClick={() => router.push(`/clients/${a.clientId}` as never)}
                  className="flex items-center gap-3 p-3 w-full text-left rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{a.firstName} {a.lastName}</p>
                    <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">{a.email} · {a.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">
                      {a.acceptedAt?.toDate ? format(a.acceptedAt.toDate(), 'd MMM yyyy HH:mm', { locale: fr }) : ''}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">v{a.version} · {a.emailSent ? 'PDF envoyé' : 'PDF non envoyé'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheet(false)} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] flex flex-col" style={{ maxHeight: '85dvh', boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
              <h2 className="text-[17px] font-semibold">Modifier la convention</h2>
              <button onClick={() => setSheet(false)} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 space-y-4 pb-4">
              {convention.acceptanceCount > 0 && (
                <p className="text-[12px] p-3 rounded-[var(--radius-md)]" style={{ background: '#FFF6E5', color: '#8A5A00' }}>
                  {convention.acceptanceCount} personne{convention.acceptanceCount > 1 ? 's ont' : ' a'} déjà signé. Modifier le prix, le créneau, l&apos;activité ou les effectifs créera automatiquement une nouvelle version ({bumpVersion(convention.version)}) datée d&apos;aujourd&apos;hui.
                </p>
              )}
              <FormField label="Titre" required>
                <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
              </FormField>
              <FormField label="Activité">
                <Input value={form.activityLabel} onChange={(e) => setForm(f => ({ ...f, activityLabel: e.target.value }))} />
              </FormField>
              <FormField label="Créneau" required>
                <Input value={form.dayTimeLabel} onChange={(e) => setForm(f => ({ ...f, dayTimeLabel: e.target.value }))} />
              </FormField>
              <FormField label="Prix par séance (CHF, groupe entier)" required>
                <Input type="number" min="0" step="0.05" value={form.pricePerSession} onChange={(e) => setForm(f => ({ ...f, pricePerSession: e.target.value }))} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Participants (nominal)" required>
                  <Input type="number" min="1" value={form.groupSize} onChange={(e) => setForm(f => ({ ...f, groupSize: e.target.value }))} />
                </FormField>
                <FormField label="Maximum" required>
                  <Input type="number" min="1" value={form.maxParticipants} onChange={(e) => setForm(f => ({ ...f, maxParticipants: e.target.value }))} />
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
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
