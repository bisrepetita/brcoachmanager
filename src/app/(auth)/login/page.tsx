'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signInWithEmailAndPassword, sendPasswordResetEmail, type AuthError } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/firestore'
import { useGoogleAuthRedirect } from '@/lib/hooks/useGoogleAuthRedirect'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { CLIENT_HOME } from '@/lib/utils/client-routes'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { C, card, primaryButton, secondaryButton, pageTitle, inputStyle, Field, GoogleIcon } from '@/components/client/ClientUI'

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Email ou mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte avec cet email.',
  'auth/wrong-password': 'Mot de passe incorrect.',
  'auth/too-many-requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
  'auth/user-disabled': 'Ce compte a été désactivé.',
  'auth/network-request-failed': 'Problème de connexion réseau.',
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || undefined
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [resetMode, setResetMode] = React.useState(false)
  const [resetSent, setResetSent] = React.useState(false)
  const [resetLoading, setResetLoading] = React.useState(false)
  const { error: googleError, setError: setGoogleError, signIn: signInWithGoogle, signingIn: googleLoading } = useGoogleAuthRedirect(redirectTo)

  React.useEffect(() => {
    if (googleError) setError(googleError)
  }, [googleError])

  async function handleGoogleSignIn() {
    setError(null); setGoogleError(null)
    await signInWithGoogle()
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
      router.replace((redirectTo || (isOnlyClient ? CLIENT_HOME : '/calendar')) as never)
    } catch (err) {
      const code = (err as AuthError).code
      setError(FIREBASE_ERROR_MESSAGES[code] ?? 'Une erreur est survenue. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  const signupHref = redirectTo ? `/signup?redirect=${encodeURIComponent(redirectTo)}` : '/signup'

  return (
    <div className="client-theme" style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 32px', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', height: 40 }}>
          <BrandLogo />
        </header>

        <h1 style={{ ...pageTitle, margin: '40px 0 8px' }}>{resetMode ? 'Mot de passe oublié' : 'Connexion'}</h1>
        <p style={{ margin: '0 0 28px', fontSize: 15, color: C.muted }}>
          {resetMode ? 'Entre ton email, on t\'envoie un lien pour le réinitialiser.' : 'Content de te revoir !'}
        </p>

        {resetMode ? (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {resetSent ? (
              <div style={{ ...card, background: C.greenBg }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.green }}>Email envoyé ✓</p>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: C.green }}>Vérifie ta boîte mail et suis le lien pour réinitialiser ton mot de passe.</p>
              </div>
            ) : (
              <>
                <Field id="reset-email" label="Email">
                  <input
                    id="reset-email" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom@email.ch" style={inputStyle}
                  />
                </Field>
                {error && <ErrorBox>{error}</ErrorBox>}
                <button type="submit" disabled={resetLoading} style={{ ...primaryButton, height: 52, marginTop: 4, opacity: resetLoading ? 0.7 : 1 }}>
                  {resetLoading ? 'Envoi…' : 'Envoyer le lien'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setResetMode(false); setResetSent(false); setError(null) }}
              style={linkButton}
            >
              ← Retour à la connexion
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field id="email" label="Email">
                <input
                  id="email" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom@email.ch" style={inputStyle}
                />
              </Field>
              <Field id="password" label="Mot de passe">
                <div style={{ position: 'relative' }}>
                  <input
                    id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" style={{ ...inputStyle, paddingRight: 52 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Masquer' : 'Afficher'}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36,
                      borderRadius: 9999, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              <button type="button" onClick={() => { setResetMode(true); setError(null) }} style={{ ...linkButton, alignSelf: 'flex-end', padding: '0 4px', marginTop: -4 }}>
                Mot de passe oublié ?
              </button>

              {error && <ErrorBox>{error}</ErrorBox>}

              <button type="submit" disabled={loading} style={{ ...primaryButton, height: 52, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: C.line }} />
              <span style={{ fontSize: 13, color: C.muted }}>ou</span>
              <div style={{ flex: 1, height: 1, background: C.line }} />
            </div>

            <button type="button" onClick={handleGoogleSignIn} disabled={googleLoading} style={{ ...secondaryButton, height: 52, gap: 10, background: C.card, border: `1px solid ${C.line}`, opacity: googleLoading ? 0.7 : 1 }}>
              <GoogleIcon />
              {googleLoading ? 'Connexion…' : 'Continuer avec Google'}
            </button>

            <div style={{ ...card, marginTop: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Pas encore de compte ?</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>Crée-le en une minute pour réserver.</p>
              </div>
              <Link href={signupHref as never} style={{ ...secondaryButton, height: 40, padding: '0 16px' }}>Créer</Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 16, background: C.redBg, color: C.red, fontSize: 14, lineHeight: 1.4 }}>
      {children}
    </div>
  )
}

const linkButton: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: C.muted,
}
