'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useAuth } from '@/lib/hooks/useAuth'
import { AdminHub } from '@/components/layout/AdminHub'
import { LogOut, User, BarChart2, ChevronRight, Calendar, Copy, Check, ExternalLink, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { requestNotificationPermission } from '@/lib/firebase/messaging'

function generateSecret(): string {
  const arr = new Uint8Array(18)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function SettingsPage() {
  const { user, isAdmin, logout } = useAuth()
  const [copied, setCopied] = useState(false)
  const [gcalUrl, setGcalUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notifStatus, setNotifStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [notifDetail, setNotifDetail] = useState('')

  async function testNotification() {
    if (!user?.id) { setNotifDetail('Utilisateur non chargé'); return }
    setNotifStatus('sending')
    setNotifDetail('Demande de permission…')
    try {
      if (!('Notification' in window)) { setNotifDetail('Notifications non supportées'); setNotifStatus('error'); return }
      if (Notification.permission === 'denied') { setNotifDetail('Notifications bloquées dans le navigateur'); setNotifStatus('error'); return }

      const token = await requestNotificationPermission(user.id)
      if (!token) { setNotifDetail('Token FCM introuvable — clé VAPID manquante ou permission refusée'); setNotifStatus('error'); return }

      setNotifDetail('Token OK, envoi…')
      const { getAuth } = await import('firebase/auth')
      const idToken = await getAuth().currentUser?.getIdToken()
      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ userIds: [user.id], title: 'Test BRCoachManager', body: 'Les notifications fonctionnent !' }),
      })
      const data = await res.json()
      if (res.ok) {
        setNotifDetail(`Envoyé (${data.sent ?? 0} reçu, ${data.failed ?? 0} échoué)`)
        setNotifStatus('sent')
      } else {
        setNotifDetail(`Erreur API: ${data.error ?? res.status}`)
        setNotifStatus('error')
      }
    } catch (e) {
      setNotifDetail(`Exception: ${(e as Error).message}`)
      setNotifStatus('error')
    }
    setTimeout(() => { setNotifStatus('idle'); setNotifDetail('') }, 6000)
  }

  // Génère un icalSecret si l'utilisateur n'en a pas
  useEffect(() => {
    if (!user?.id || user.icalSecret) return
    const secret = generateSecret()
    updateDoc(doc(db, 'users', user.id), { icalSecret: secret, updatedAt: serverTimestamp() }).catch(() => {})
  }, [user?.id, user?.icalSecret])

  useEffect(() => {
    if (user?.googleCalendarUrl) setGcalUrl(user.googleCalendarUrl)
  }, [user?.googleCalendarUrl])

  const icalUrl = user?.id && user?.icalSecret
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://brcoachmanager.vercel.app'}/api/ical/${user.id}?secret=${user.icalSecret}`
    : null

  async function copyIcalUrl() {
    if (!icalUrl) return
    await navigator.clipboard.writeText(icalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function saveGcalUrl() {
    if (!user?.id) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'users', user.id), { googleCalendarUrl: gcalUrl.trim(), updatedAt: serverTimestamp() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <TopBar title="Paramètres" />
      <TopBarSpacer />

      <div className="p-4 space-y-6">
        {/* Profil */}
        <section>
          <p className="section-label mb-3">Mon compte</p>
          <div className="flex items-center gap-3 p-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: user?.color ?? '#1A1A18' }}>
              <User size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[var(--color-text-primary)] truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">{user?.email}</p>
            </div>
          </div>
        </section>

        {/* Google Calendar */}
        <section>
          <p className="section-label mb-3">Google Calendar</p>
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">

            {/* Export : app → Google */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={15} style={{ color: '#7A7570' }} />
                <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Mes séances dans Google Calendar</p>
              </div>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                Copie ce lien et ajoute-le dans Google Calendar → Autres agendas → "Via une URL"
              </p>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[#F9F8F6]">
                  <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">{icalUrl ?? 'Génération en cours…'}</p>
                </div>
                <button onClick={copyIcalUrl} disabled={!icalUrl}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)]"
                  style={{ background: copied ? '#E8F3EE' : 'transparent' }}>
                  {copied ? <Check size={15} color="#2D7A4F" /> : <Copy size={15} color="#7A7570" />}
                </button>
              </div>
              <a href="https://calendar.google.com/calendar/r/settings/other" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] no-underline">
                <ExternalLink size={11} />Ouvrir Google Calendar
              </a>
            </div>

            {/* Import : Google → app */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={15} style={{ color: '#7A7570' }} />
                <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Afficher Google Calendar dans l&apos;app</p>
              </div>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                Dans Google Calendar → Paramètres → ton agenda → copie l&apos;«Adresse secrète au format iCal»
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  value={gcalUrl}
                  onChange={e => setGcalUrl(e.target.value)}
                  className="flex-1 min-w-0 h-9 px-3 text-[13px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[#F9F8F6] outline-none"
                />
                <button onClick={saveGcalUrl} disabled={saving}
                  className="shrink-0 px-3 h-9 text-[13px] font-medium rounded-[var(--radius-md)] border border-[var(--color-border)]"
                  style={{ background: saved ? '#E8F3EE' : '#fff', color: saved ? '#2D7A4F' : '#1A1A18' }}>
                  {saved ? '✓' : saving ? '…' : 'OK'}
                </button>
              </div>
              {gcalUrl && (
                <button onClick={() => { setGcalUrl(''); updateDoc(doc(db, 'users', user!.id), { googleCalendarUrl: '', updatedAt: serverTimestamp() }) }}
                  className="text-[11px] text-[var(--color-text-tertiary)]">
                  Supprimer le lien
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <p className="section-label mb-3">Notifications</p>
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Bell size={15} style={{ color: '#7A7570', flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Tester les notifications push</p>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">
                  {typeof window !== 'undefined' && 'Notification' in window
                    ? Notification.permission === 'granted' ? 'Autorisées ✓' : Notification.permission === 'denied' ? 'Bloquées — modifie les réglages du navigateur' : 'Non encore acceptées'
                    : 'Non supportées sur ce navigateur'}
                </p>
              </div>
            </div>
            <button onClick={testNotification} disabled={notifStatus === 'sending'}
              className="shrink-0 px-3 h-8 text-[12px] font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] whitespace-nowrap"
              style={{ background: notifStatus === 'sent' ? '#E8F3EE' : notifStatus === 'error' ? '#FEE2E2' : '#fff', color: notifStatus === 'sent' ? '#2D7A4F' : notifStatus === 'error' ? '#DC2626' : '#1A1A18' }}>
              {notifStatus === 'sending' ? '…' : notifStatus === 'sent' ? 'Envoyé ✓' : notifStatus === 'error' ? 'Erreur' : 'Tester'}
            </button>
          </div>
          {notifDetail ? (
            <p className="mt-2 text-[11px] px-1" style={{ color: notifStatus === 'error' ? '#DC2626' : '#7A7570' }}>{notifDetail}</p>
          ) : null}
        </section>

        {/* Admin hub */}
        {isAdmin && <AdminHub />}

        {/* Suivi indépendant */}
        {!isAdmin && (
          <section>
            <p className="section-label mb-3">Mode indépendant</p>
            <Link href="/independent" className="flex items-center gap-3 px-4 py-3.5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] no-underline press-effect">
              <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center shrink-0" style={{ background: '#F0EDE8' }}>
                <BarChart2 size={18} style={{ color: '#7A7570' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)]">Suivi location de salle</p>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">Montants dus à l&apos;entreprise</p>
              </div>
              <ChevronRight size={16} style={{ color: '#C8C4BC' }} />
            </Link>
          </section>
        )}

        {/* Déconnexion */}
        <section>
          <Button variant="outline" size="lg" className="w-full" onClick={logout}>
            <LogOut size={16} />Se déconnecter
          </Button>
        </section>

        <p className="text-center text-[11px] text-[var(--color-text-disabled)]">BRCoachManager · Bis Repetita</p>
      </div>
    </>
  )
}
