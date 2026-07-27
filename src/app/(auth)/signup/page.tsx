'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword, signOut, type AuthError } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useGoogleAuthRedirect } from '@/lib/hooks/useGoogleAuthRedirect'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'Un compte existe déjà avec cet email. Essaie de te connecter.',
  'auth/invalid-email': 'Adresse email invalide.',
  'auth/weak-password': 'Mot de passe trop faible (6 caractères minimum).',
  'auth/network-request-failed': 'Problème de connexion réseau.',
}

export default function SignupPage() {
  const router = useRouter()
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const { error: googleError, setError: setGoogleError, signIn: signInWithGoogle, signingIn: googleLoading } = useGoogleAuthRedirect()

  React.useEffect(() => {
    if (googleError) setError(googleError)
  }, [googleError])

  async function handleGoogleSignIn() {
    setError(null); setGoogleError(null)
    await signInWithGoogle()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      try {
        const idToken = await cred.user.getIdToken()
        const res = await fetch('/api/client-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || undefined }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? 'Erreur lors de la création du profil')
        }
        document.cookie = 'br_session=1; path=/; max-age=86400; SameSite=Strict'
        router.replace('/group-sessions')
      } catch (linkErr) {
        // Le compte Auth existe mais le profil n'a pas pu être créé : on déconnecte
        // pour éviter un état incohérent, l'utilisateur peut réessayer.
        await signOut(auth).catch(() => {})
        setError(linkErr instanceof Error ? linkErr.message : 'Erreur lors de la création du profil. Réessaie.')
      }
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

        <div className="mb-10 text-center">
          <img
            src="/icons/icon-512.png"
            alt="Bis Repetita"
            className="w-14 h-14 mb-5 mx-auto"
            style={{ borderRadius: 'var(--radius-lg)' }}
          />
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Créer un compte
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            Bis Repetita
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="firstName" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Prénom</label>
              <input
                id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)}
                style={{ borderRadius: 'var(--radius-input)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                className="w-full h-12 px-4 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)]"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lastName" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Nom</label>
              <input
                id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)}
                style={{ borderRadius: 'var(--radius-input)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                className="w-full h-12 px-4 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
            <input
              id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@email.ch"
              style={{ borderRadius: 'var(--radius-input)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
              className="w-full h-12 px-4 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-disabled)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Téléphone (optionnel)</label>
            <input
              id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+41 79 000 00 00"
              style={{ borderRadius: 'var(--radius-input)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
              className="w-full h-12 px-4 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-disabled)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Mot de passe</label>
            <div className="relative">
              <input
                id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                style={{ borderRadius: 'var(--radius-input)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                className="w-full h-12 px-4 pr-12 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-disabled)]"
              />
              <button
                type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                aria-label={showPassword ? 'Masquer' : 'Afficher'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3" style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-danger-bg)', border: '1px solid #FBBCB8' }}>
              <p className="text-[13px] leading-snug" style={{ color: 'var(--color-danger)' }}>{error}</p>
            </div>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
            Créer mon compte
          </Button>

          <button
            type="button" onClick={() => router.push('/login')}
            className="w-full text-center text-[13px] mt-1" style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            J&apos;ai déjà un compte
          </button>
        </form>

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
      </div>
    </div>
  )
}
