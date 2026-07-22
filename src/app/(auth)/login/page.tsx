'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword, signInWithRedirect, sendPasswordResetEmail, type AuthError } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, googleProvider } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/firestore'
import { useGoogleAuthRedirect } from '@/lib/hooks/useGoogleAuthRedirect'
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
  const { error: googleError, setError: setGoogleError } = useGoogleAuthRedirect()
  const [googleLoading, setGoogleLoading] = React.useState(false)

  React.useEffect(() => {
    if (googleError) setError(googleError)
  }, [googleError])

  async function handleGoogleSignIn() {
    setError(null); setGoogleError(null); setGoogleLoading(true)
    try {
      await signInWithRedirect(auth, googleProvider)
    } catch {
      setError('Erreur lors de la connexion avec Google.')
      setGoogleLoading(false)
    }
  }

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
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
      document.cookie = 'br_session=1; path=/; max-age=86400; SameSite=Strict'
      const userSnap = await getDoc(doc(db, 'users', cred.user.uid)).catch(() => null)
      const roles = (userSnap?.data()?.['roles'] as string[] | undefined) ?? []
      const isOnlyClient = roles.includes('client') && !roles.includes('coach') && !roles.includes('admin')
      router.replace(isOnlyClient ? '/group-sessions' : '/calendar')
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
          <img
            src="/icons/icon-512.png"
            alt="Bis Repetita"
            className="w-14 h-14 mb-5 mx-auto"
            style={{ borderRadius: 'var(--radius-lg)' }}
          />
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Bis Repetita
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            Connexion
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
                    placeholder="prenom@email.ch"
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
              placeholder="prenom@email.ch"
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

        {!resetMode && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
              <span className="text-[12px]" style={{ color: 'var(--color-text-disabled)' }}>ou</span>
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            </div>
            <Button
              type="button" variant="outline" size="lg" loading={googleLoading}
              className="w-full flex items-center justify-center gap-2"
              onClick={handleGoogleSignIn}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
              </svg>
              Continuer avec Google
            </Button>
          </>
        )}

        {!resetMode && (
          <button
            type="button" onClick={() => router.push('/signup')}
            className="w-full text-center text-[13px] mt-4" style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Client Bis Repetita ? Crée ton compte
          </button>
        )}

        <p className="mt-6 text-center text-[12px]" style={{ color: 'var(--color-text-disabled)' }}>
          Bis Repetita Boxing Studio
        </p>
      </div>
    </div>
  )
}
