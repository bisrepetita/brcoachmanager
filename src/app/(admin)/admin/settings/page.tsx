'use client'

import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Save, MessageCircle, Info, CalendarClock } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/firebase/firestore'

const DEFAULT_TEMPLATE = 'Bonjour {prenom}, voici votre lien de paiement pour la séance du {date} : {lien}'
const VARIABLES = ['{prenom}', '{date}', '{lien}']
const DEFAULT_CANCELLATION_DEADLINE_HOURS = 24

export default function AdminSettingsPage() {
  const [template, setTemplate] = useState('')
  const [cancellationDeadlineHours, setCancellationDeadlineHours] = useState(DEFAULT_CANCELLATION_DEADLINE_HOURS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'global')).then(snap => {
      const data = snap.exists() ? snap.data() : undefined
      setTemplate(data?.whatsappTemplate || DEFAULT_TEMPLATE)
      setCancellationDeadlineHours(data?.groupSessionCancellationDeadlineHours ?? DEFAULT_CANCELLATION_DEADLINE_HOURS)
    }).finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        whatsappTemplate: template,
        groupSessionCancellationDeadlineHours: cancellationDeadlineHours,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const preview = template
    .replace('{prenom}', 'Marie')
    .replace('{date}', '19 juin 2026')
    .replace('{lien}', 'https://pay.stripe.com/...')

  return (
    <>
      <TopBar title="Réglages" />
      <TopBarSpacer />

      <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Template WhatsApp */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <MessageCircle size={16} color="#7A7570" />
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7A7570', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Message WhatsApp
            </p>
          </div>

          <p style={{ fontSize: 13, color: '#7A7570', margin: '0 0 12px' }}>
            Envoyé automatiquement avec le lien de paiement. Variables disponibles :
          </p>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {VARIABLES.map(v => (
              <button
                key={v}
                onClick={() => {
                  const ta = document.getElementById('wa-template') as HTMLTextAreaElement
                  if (!ta) { setTemplate(t => t + v); return }
                  const start = ta.selectionStart
                  const end = ta.selectionEnd
                  setTemplate(t => t.slice(0, start) + v + t.slice(end))
                  setTimeout(() => {
                    ta.selectionStart = ta.selectionEnd = start + v.length
                    ta.focus()
                  }, 0)
                }}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: '1px solid #E5E1DA',
                  background: '#F5F2EE', fontSize: 12, fontFamily: 'monospace',
                  color: '#1A1A18', cursor: 'pointer',
                }}
              >
                {v}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ height: 96, borderRadius: 10, background: '#F5F2EE' }} />
          ) : (
            <textarea
              id="wa-template"
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={4}
              style={{
                width: '100%', borderRadius: 10, border: '1px solid #E5E1DA',
                padding: '10px 12px', fontSize: 14, color: '#1A1A18', lineHeight: 1.5,
                fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                background: '#fff',
              }}
            />
          )}

          {/* Prévisualisation */}
          {template && (
            <div style={{
              marginTop: 10, background: '#E8F5E9', borderRadius: 10, padding: '10px 12px',
              borderLeft: '3px solid #4CAF50',
            }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <Info size={12} color="#388E3C" />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#388E3C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Aperçu
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#1B5E20', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {preview}
              </p>
            </div>
          )}

          <button
            onClick={() => setTemplate(DEFAULT_TEMPLATE)}
            style={{
              marginTop: 8, background: 'none', border: 'none', padding: 0,
              fontSize: 12, color: '#A09890', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Réinitialiser par défaut
          </button>
        </section>

        {/* Séances collectives */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CalendarClock size={16} color="#7A7570" />
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7A7570', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Séances collectives
            </p>
          </div>

          <p style={{ fontSize: 13, color: '#7A7570', margin: '0 0 12px' }}>
            Délai avant lequel un client peut annuler lui-même son inscription à une séance collective.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={0}
              value={cancellationDeadlineHours}
              onChange={e => setCancellationDeadlineHours(Math.max(0, Number(e.target.value)))}
              style={{
                width: 90, height: 40, borderRadius: 8, border: '1px solid #E5E1DA',
                padding: '0 10px', fontSize: 14, color: '#1A1A18', background: '#fff', outline: 'none',
              }}
            />
            <span style={{ fontSize: 14, color: '#1A1A18' }}>heures avant le début</span>
          </div>
        </section>

        <div>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Save size={15} />
            {saved ? 'Enregistré ✓' : saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>

      </div>
    </>
  )
}
