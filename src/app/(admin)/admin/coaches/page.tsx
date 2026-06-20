'use client'

import { useState, useCallback } from 'react'
import { orderBy } from 'firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { createCoach, updateCoach, toggleCoachActive } from '@/lib/services/user.service'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, ChevronRight, UserCheck, UserX, Users, Trash2 } from 'lucide-react'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/config'
import type { User } from '@/types'
import { COACH_COLORS } from '@/types'

const ROLES_OPTIONS = [
  { value: 'coach', label: 'Coach uniquement' },
  { value: 'admin,coach', label: 'Admin + Coach' },
]

type SheetMode = 'create' | 'edit' | null

export default function CoachesPage() {
  const router = useRouter()
  const { data: coaches, loading } = useCollection<User>('users', [orderBy('firstName')])
  const [sheet, setSheet] = useState<SheetMode>(null)
  const [editing, setEditing] = useState<User | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState('coach')
  const [color, setColor] = useState<string>(COACH_COLORS[0])

  function openCreate() {
    setEditing(null); setFirstName(''); setLastName(''); setEmail(''); setPhone('')
    setRoles('coach'); setColor(COACH_COLORS[0]); setError(null); setSheet('create')
  }

  function openEdit(coach: User) {
    setEditing(coach); setFirstName(coach.firstName); setLastName(coach.lastName)
    setPhone(coach.phone ?? '')
    setRoles(coach.roles.includes('admin') ? 'admin,coach' : 'coach')
    setColor(coach.color)
    setError(null)
    setSheet('edit')
  }

  function close() { setSheet(null); setEditing(null); setConfirmDelete(false) }

  const handleDelete = useCallback(async () => {
    if (!editing) return
    setDeleting(true)
    try {
      const auth = getAuth(firebaseApp)
      const token = await auth.currentUser?.getIdToken()
      await fetch('/api/delete-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ coachId: editing.id }),
      })
      close()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleting(false)
    }
  }, [editing])

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) { setError('Prénom et nom sont requis.'); return }
    if (sheet === 'create' && !email.trim()) { setError('L\'email est requis.'); return }
    setSaving(true); setError(null)
    try {
      if (sheet === 'create') {
        await createCoach({
          firstName: firstName.trim(), lastName: lastName.trim(),
          email, phone,
          roles: roles === 'admin,coach' ? ['admin', 'coach'] : ['coach'],
          color,
        })
      } else if (editing) {
        await updateCoach(editing.id, {
          firstName: firstName.trim(), lastName: lastName.trim(),
          phone, color,
          roles: roles === 'admin,coach' ? ['admin', 'coach'] : ['coach'],
        })
      }
      close()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <>
      <TopBar
        title="Coachs"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : coaches.length === 0 ? (
        <EmptyState icon={Users} title="Aucun coach" description="Ajoute le premier coach." action={<Button onClick={openCreate}><Plus size={16} />Ajouter un coach</Button>} />
      ) : (
        <div className="p-4 space-y-2">
          {coaches.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[13px] font-semibold text-white" style={{ background: c.color }}>
                {c.firstName[0]}{c.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{c.firstName} {c.lastName}</p>
                  {c.roles.includes('admin') && <Badge variant="gold">Admin</Badge>}
                  {!c.active && <Badge variant="muted">Inactif</Badge>}
                </div>
                {c.email && <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">{c.email}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => toggleCoachActive(c.id, !c.active)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-elevated)]">
                  {c.active ? <UserCheck size={16} style={{ color: '#7A7570' }} /> : <UserX size={16} style={{ color: 'var(--color-danger)' }} />}
                </button>
                <button onClick={() => openEdit(c)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-elevated)]">
                  <ChevronRight size={16} style={{ color: '#C8C4BC' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau coach' : 'Modifier le coach'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Prénom" required>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Prénom" />
              </FormField>
              <FormField label="Nom" required>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" />
              </FormField>
            </div>
            {sheet === 'create' && (
              <FormField label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@email.com" />
              </FormField>
            )}
            <FormField label="Téléphone">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+41 76 000 00 00" />
            </FormField>
            <FormField label="Rôle">
              <div className="space-y-2">
                {ROLES_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setRoles(opt.value)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-md)] border text-left"
                    style={{ background: roles === opt.value ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: roles === opt.value ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                    <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: roles === opt.value ? 'var(--color-accent)' : 'var(--color-border)', background: roles === opt.value ? 'var(--color-accent)' : 'transparent' }} />
                    <span className="text-[13px] font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Couleur agenda">
              <div className="flex gap-2 flex-wrap">
                {COACH_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-full transition-transform"
                    style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px', transform: color === c ? 'scale(1.15)' : 'scale(1)' }} />
                ))}
              </div>
            </FormField>
            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer le coach' : 'Enregistrer'}
            </Button>

            {sheet === 'edit' && (
              confirmDelete ? (
                <div className="space-y-2 pt-1">
                  <p className="text-[13px] text-center text-[var(--color-text-tertiary)]">Supprimer définitivement ce coach ?</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="lg" className="flex-1" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                    <Button size="lg" className="flex-1" onClick={handleDelete} loading={deleting}
                      style={{ background: '#C0392B', color: '#fff', borderColor: '#C0392B' }}>
                      Confirmer
                    </Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-[13px] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]">
                  <Trash2 size={14} />Supprimer ce coach
                </button>
              )
            )}
          </div>
        </div>
      )}
    </>
  )
}
