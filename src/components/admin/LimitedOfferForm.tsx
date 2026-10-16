'use client'

import { useState } from 'react'
import { deleteField, Timestamp } from 'firebase/firestore'
import { format } from 'date-fns'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { DEFAULT_LIMITED_OFFER_LABEL, type LimitedOfferFields } from '@/lib/utils/limited-offer'

/**
 * Champs « offre temporaire » des formulaires de pack et de formule d'abonnement (admin).
 * `data(isEdit)` donne les champs à enregistrer — et les supprime en édition quand l'offre est retirée.
 */
export function useLimitedOfferForm() {
  const [enabled, setEnabled] = useState(false)
  const [label, setLabel] = useState('')
  const [endDate, setEndDate] = useState('') // yyyy-MM-dd, vide = sans date de fin

  function reset() { setEnabled(false); setLabel(''); setEndDate('') }

  function load(plan: LimitedOfferFields) {
    setEnabled(!!plan.limitedOffer)
    setLabel(plan.limitedOfferLabel ?? '')
    setEndDate(plan.limitedOfferEndsAt ? format(plan.limitedOfferEndsAt.toDate(), 'yyyy-MM-dd') : '')
  }

  function data(isEdit: boolean): Record<string, unknown> {
    if (!enabled) {
      return isEdit ? { limitedOffer: deleteField(), limitedOfferLabel: deleteField(), limitedOfferEndsAt: deleteField() } : {}
    }
    return {
      limitedOffer: true,
      ...(label.trim() ? { limitedOfferLabel: label.trim() } : (isEdit ? { limitedOfferLabel: deleteField() } : {})),
      // Fin de journée, heure locale : l'offre reste valable tout le dernier jour
      ...(endDate ? { limitedOfferEndsAt: Timestamp.fromDate(new Date(`${endDate}T23:59:59`)) } : (isEdit ? { limitedOfferEndsAt: deleteField() } : {})),
    }
  }

  const fields = (
    <FormField label="Offre temporaire" hint="Affiche un badge sur l'offre côté client. Après la date de fin, l'offre n'est plus proposée ni achetable.">
      <div className="space-y-2">
        <button type="button" onClick={() => setEnabled(v => !v)}
          className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border text-left"
          style={{ background: enabled ? 'var(--color-accent-subtle)' : 'var(--color-surface)', borderColor: enabled ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
          <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
            style={{ background: enabled ? 'var(--color-accent)' : 'transparent', border: `2px solid ${enabled ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
            {enabled && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
          </div>
          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">C&apos;est une offre temporaire</span>
        </button>
        {enabled && (
          <div className="grid grid-cols-2 gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={DEFAULT_LIMITED_OFFER_LABEL} maxLength={30} />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="Date de fin (facultative)" />
          </div>
        )}
        {enabled && (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            Texte du badge (« {DEFAULT_LIMITED_OFFER_LABEL} » si vide) · dernier jour de l&apos;offre (facultatif)
          </p>
        )}
      </div>
    </FormField>
  )

  return { fields, reset, load, data }
}
