'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import type { PrivateGroup } from '@/types'

export interface PrivateGroupFormValues {
  name: string
  sponsorAmountPerSession: string
  participantPrice: string
  contactName: string
  contactEmail: string
  notes: string
}

export function emptyPrivateGroupForm(): PrivateGroupFormValues {
  return { name: '', sponsorAmountPerSession: '', participantPrice: '0', contactName: '', contactEmail: '', notes: '' }
}

export function privateGroupToForm(g: PrivateGroup): PrivateGroupFormValues {
  return {
    name: g.name,
    sponsorAmountPerSession: String(g.sponsorAmountPerSession),
    participantPrice: String(g.participantPrice),
    contactName: g.contactName ?? '',
    contactEmail: g.contactEmail ?? '',
    notes: g.notes ?? '',
  }
}

export function parsePrivateGroupForm(form: PrivateGroupFormValues):
  { data: Pick<PrivateGroup, 'name' | 'sponsorAmountPerSession' | 'participantPrice' | 'contactName' | 'contactEmail' | 'notes'> } | { error: string } {
  const sponsorAmountPerSession = Number(form.sponsorAmountPerSession || 0)
  const participantPrice = Number(form.participantPrice || 0)
  if (!form.name.trim()) return { error: 'Le nom est requis.' }
  if (Number.isNaN(sponsorAmountPerSession) || sponsorAmountPerSession < 0) return { error: 'Le montant société doit être positif ou nul.' }
  if (Number.isNaN(participantPrice) || participantPrice < 0) return { error: 'La participation doit être positive ou nulle.' }
  return {
    data: {
      name: form.name.trim(),
      sponsorAmountPerSession,
      participantPrice,
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      notes: form.notes.trim(),
    },
  }
}

export function PrivateGroupForm({ title, submitLabel, form, setForm, error, saving, onSubmit, onClose }: {
  title: string
  submitLabel: string
  form: PrivateGroupFormValues
  setForm: Dispatch<SetStateAction<PrivateGroupFormValues>>
  error: string | null
  saving: boolean
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--color-surface)] rounded-t-[20px] flex flex-col" style={{ maxHeight: '85dvh', boxShadow: 'var(--shadow-sheet)' }}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 space-y-4 pb-4">
          <FormField label="Nom" required hint="Affiché aux membres, ex. le nom de la société.">
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex. Société X" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Montant société (CHF / séance)" hint="Facturé à la société.">
              <Input type="number" min="0" step="0.05" value={form.sponsorAmountPerSession} onChange={(e) => setForm(f => ({ ...f, sponsorAmountPerSession: e.target.value }))} placeholder="200" />
            </FormField>
            <FormField label="Participation (CHF / pers.)" hint="0 = gratuit pour le participant.">
              <Input type="number" min="0" step="0.05" value={form.participantPrice} onChange={(e) => setForm(f => ({ ...f, participantPrice: e.target.value }))} placeholder="0" />
            </FormField>
          </div>
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
            Valeurs par défaut reprises à la création de chaque séance du groupe (modifiables ensuite séance par séance).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Contact">
              <Input value={form.contactName} onChange={(e) => setForm(f => ({ ...f, contactName: e.target.value }))} placeholder="ex. RH — Marie Dupont" />
            </FormField>
            <FormField label="Email du contact">
              <Input type="email" value={form.contactEmail} onChange={(e) => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="rh@societe.ch" />
            </FormField>
          </div>
          <FormField label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Adresse de facturation, conditions…" />
          </FormField>

          {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
        </div>

        <div className="px-6 pb-6 pt-3 shrink-0 border-t border-[var(--color-border)]">
          <Button size="lg" className="w-full" onClick={onSubmit} loading={saving}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
