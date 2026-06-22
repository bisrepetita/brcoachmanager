'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword, sendPasswordResetEmail, type AuthError } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Email ou mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte avec cet email.',
  'auth/wrong-password': 'Mot de passe incorrect.',
  'auth/too-many-requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
  'auth/user-disabled': 'Ce compte a été désactivé.',
  'auth/network-request-failed': 'Problème de connexion réseau.',
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [resetMode, setResetMode] = React.useState(false)
  const [resetSent, setResetSent] = React.useState(false)
  const [resetLoading, setResetLoading] = React.useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Entre ton adresse email.'); return }
    setResetLoading(true); setError(null)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setResetSent(true)
    } catch (err) {
      const code = (err as AuthError).code
      setError(code === 'auth/user-not-found' ? 'Aucun compte avec cet email.' : 'Erreur lors de l\'envoi. Réessaie.')
    } finally {
      setResetLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      document.cookie = 'br_session=1; path=/; max-age=86400; SameSite=Strict'
      router.replace('/calendar')
    } catch (err) {
      const code = (err as AuthError).code
      setError(FIREBASE_ERROR_MESSAGES[code] ?? 'Une erreur est survenue. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-background)' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 mb-5"
            style={{
              background: 'var(--color-text-primary)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <span className="text-white font-bold text-lg tracking-tight">BR</span>
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            BRCoachManager
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            Bis Repetita · Espace coachs
          </p>
        </div>

        {/* Formulaire reset */}
        {resetMode ? (
          <form onSubmit={handleReset} className="space-y-4">
            {resetSent ? (
              <div className="px-4 py-4 text-center" style={{ borderRadius: 'var(--radius-md)', background: '#E8F3EE', border: '1px solid #A8D5B8' }}>
                <p className="text-[14px] font-medium" style={{ color: '#2D7A4F' }}>Email envoyé ✓</p>
                <p className="text-[13px] mt-1" style={{ color: '#4A9A6A' }}>Vérifie ta boîte mail et suis le lien pour réinitialiser ton mot de passe.</p>
              </div>
            ) : (
              <>
                <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Entre ton adresse email pour recevoir un lien de réinitialisation.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="reset-email" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="coach@bisrepetita.ch"
                    style={{ borderRadius: 'var(--radius-input)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                    className="w-full h-12 px-4 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-disabled)]"
                  />
                </div>
                {error && (
                  <div className="px-4 py-3" style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-danger-bg)', border: '1px solid #FBBCB8' }}>
                    <p className="text-[13px]" style={{ color: 'var(--color-danger)' }}>{error}</p>
                  </div>
                )}
                <Button type="submit" size="lg" loading={resetLoading} className="w-full">Envoyer le lien</Button>
              </>
            )}
            <button type="button" onClick={() => { setResetMode(false); setResetSent(false); setError(null) }}
              className="w-full text-center text-[13px] mt-2" style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Retour à la connexion
            </button>
          </form>
        ) : (

        /* Formulaire login */
        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@bisrepetita.ch"
              style={{
                borderRadius: 'var(--radius-input)',
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
              className="w-full h-12 px-4 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-disabled)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  borderRadius: 'var(--radius-input)',
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                }}
                className="w-full h-12 px-4 pr-12 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-disabled)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                aria-label={showPassword ? 'Masquer' : 'Afficher'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="px-4 py-3"
              style={{
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-danger-bg)',
                border: '1px solid #FBBCB8',
              }}
            >
              <p className="text-[13px] leading-snug" style={{ color: 'var(--color-danger)' }}>{error}</p>
            </div>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
            Se connecter
          </Button>

          <button type="button" onClick={() => { setResetMode(true); setError(null) }}
            className="w-full text-center text-[13px] mt-1" style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Mot de passe oublié ?
          </button>
        </form>
        )}

        <p className="mt-8 text-center text-[12px]" style={{ color: 'var(--color-text-disabled)' }}>
          Accès réservé aux coachs Bis Repetita
        </p>
      </div>
    </div>
  )
}
