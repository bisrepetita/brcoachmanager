'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot, orderBy } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, Copy, Check, MessageCircle, Archive, ArchiveRestore, Trash2, Pencil, RefreshCw, Building, X } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { db } from '@/lib/firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { updateDocById, deleteDocById } from '@/lib/services/crud.service'
import { generatePrivateGroupToken } from '@/lib/utils/private-group-token'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/EmptyState'
import { PrivateGroupForm, privateGroupToForm, parsePrivateGroupForm, emptyPrivateGroupForm } from '../PrivateGroupForm'
import type { PrivateGroup, PrivateGroupMember } from '@/types'

export default function PrivateGroupDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const groupId = params.id

  const [group, setGroup] = useState<PrivateGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const [sheet, setSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPrivateGroupForm())

  const { data: members, loading: loadingMembers } = useCollection<PrivateGroupMember>(
    `privateGroups/${groupId}/members`, [orderBy('joinedAt', 'desc')]
  )

  useEffect(() => {
    return onSnapshot(doc(db, 'privateGroups', groupId), (snap) => {
      setGroup(snap.exists() ? ({ id: snap.id, ...snap.data() } as PrivateGroup) : null)
      setLoading(false)
    }, () => setLoading(false))
  }, [groupId])

  const publicUrl = group && typeof window !== 'undefined' ? `${window.location.origin}/groupe/${group.token}` : ''

  function openEdit() {
    if (!group) return
    setForm(privateGroupToForm(group)); setError(null); setSheet(true)
  }

  async function handleSave() {
    if (!group) return
    const parsed = parsePrivateGroupForm(form)
    if ('error' in parsed) { setError(parsed.error); return }
    setSaving(true); setError(null)
    try {
      await updateDocById('privateGroups', group.id, parsed.data)
      setSheet(false)
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  async function regenerateLink() {
    if (!group) return
    if (!confirm('Générer un nouveau lien ? L\'ancien lien ne fonctionnera plus pour rejoindre le groupe (les membres actuels restent membres).')) return
    await updateDocById('privateGroups', group.id, { token: generatePrivateGroupToken() })
  }

  async function toggleArchive() {
    if (!group) return
    await updateDocById('privateGroups', group.id, { active: !group.active })
  }

  async function handleDelete() {
    if (!group) return
    if (!confirm('Supprimer ce groupe privé ? Son lien ne fonctionnera plus. Les séances déjà créées sont conservées.')) return
    await deleteDocById('privateGroups', group.id)
    router.push('/admin/private-groups')
  }

  async function removeMember(m: PrivateGroupMember) {
    if (!confirm(`Retirer ${m.firstName ?? ''} ${m.lastName ?? ''} du groupe ? Ses inscriptions existantes sont conservées, mais il ne verra plus les séances du groupe (sauf s'il rouvre le lien).`)) return
    await deleteDocById(`privateGroups/${groupId}/members`, m.id)
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function shareWhatsApp() {
    const text = `Bonjour, voici le lien pour vous inscrire aux séances ${group?.name} chez Bis Repetita : ${publicUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const back = <button onClick={() => router.back()}><ChevronLeft size={20} style={{ color: '#7A7570' }} /></button>
  if (loading) return <><TopBar title="Groupe privé" left={back} /><TopBarSpacer /></>
  if (!group) return <><TopBar title="Groupe privé" left={back} /><TopBarSpacer /><EmptyState icon={Building} title="Groupe introuvable" /></>

  return (
    <>
      <TopBar
        title={group.name}
        left={back}
        right={<button onClick={openEdit} className="p-2"><Pencil size={18} style={{ color: '#7A7570' }} /></button>}
      />
      <TopBarSpacer />

      <div className="p-4 space-y-4">
        {/* Résumé */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-1">
          <p className="text-[15px] font-medium text-[var(--color-text-primary)]">
            Société CHF {group.sponsorAmountPerSession}.- / séance · Participation CHF {group.participantPrice}.- / pers.
          </p>
          {(group.contactName || group.contactEmail) && (
            <p className="text-[12px] text-[var(--color-text-tertiary)]">
              Contact : {[group.contactName, group.contactEmail].filter(Boolean).join(' · ')}
            </p>
          )}
          {group.notes && <p className="text-[12px] text-[var(--color-text-tertiary)] whitespace-pre-wrap">{group.notes}</p>}
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
            {group.active ? 'Actif' : 'Archivé'} · {members.length} membre{members.length > 1 ? 's' : ''}
          </p>
        </div>

        {/* Lien d'accès */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
          <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Lien à envoyer</p>
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
            En l&apos;ouvrant (avec un compte), la personne rejoint le groupe et voit ensuite ses séances dans son planning.
          </p>
          <div className="flex items-center gap-2">
            <Input value={publicUrl} readOnly onFocus={(e) => e.target.select()} className="text-[12px]" />
            <Button size="icon" variant="secondary" onClick={copyLink}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="md" variant="secondary" className="flex-1" onClick={shareWhatsApp}>
              <MessageCircle size={16} />
              WhatsApp
            </Button>
            <Button size="md" variant="secondary" className="flex-1" onClick={regenerateLink}>
              <RefreshCw size={16} />
              Nouveau lien
            </Button>
          </div>
          {!group.active && (
            <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>Groupe archivé : le lien ne permet plus de rejoindre le groupe.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="md" variant="secondary" className="flex-1" onClick={toggleArchive}>
            {group.active ? <Archive size={16} /> : <ArchiveRestore size={16} />}
            {group.active ? 'Archiver' : 'Réactiver'}
          </Button>
          <Button size="md" variant="destructive" onClick={handleDelete}>
            <Trash2 size={16} />
          </Button>
        </div>

        {/* Membres */}
        <div>
          <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">
            Membres ({members.length})
          </p>
          {loadingMembers ? (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Chargement…</p>
          ) : members.length === 0 ? (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Personne n&apos;a encore rejoint ce groupe.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-3 w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <button onClick={() => router.push(`/clients/${m.clientId}` as never)} className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{m.firstName} {m.lastName}</p>
                    <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">
                      {m.email}{m.joinedAt?.toDate ? ` · depuis le ${format(m.joinedAt.toDate(), 'd MMM yyyy', { locale: fr })}` : ''}
                    </p>
                  </button>
                  <button onClick={() => removeMember(m)} className="p-2 shrink-0" aria-label="Retirer du groupe">
                    <X size={16} style={{ color: '#A09890' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <PrivateGroupForm
          title="Modifier le groupe"
          submitLabel="Enregistrer"
          form={form} setForm={setForm} error={error} saving={saving}
          onSubmit={handleSave} onClose={() => setSheet(false)}
        />
      )}
    </>
  )
}
