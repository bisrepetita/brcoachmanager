'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createUserWithEmailAndPassword, signOut, type AuthError } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useGoogleAuthRedirect } from '@/lib/hooks/useGoogleAuthRedirect'
import Link from 'next/link'
import { Eye, EyeOff, Gift } from 'lucide-react'
import { CLIENT_HOME } from '@/lib/utils/client-routes'
import { clearReferralCode, readReferralCode } from '@/lib/utils/referral'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { C, card, iconCircle, primaryButton, secondaryButton, pageTitle, inputStyle, Field, GoogleIcon } from '@/components/client/ClientUI'

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'Un compte existe déjà avec cet email. Essaie de te connecter.',
  'auth/invalid-email': 'Adresse email invalide.',
  'auth/weak-password': 'Mot de passe trop faible (6 caractères minimum).',
  'auth/network-request-failed': 'Problème de connexion réseau.',
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  )
}

function SignupPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || undefined
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const { error: googleError, setError: setGoogleError, signIn: signInWithGoogle, signingIn: googleLoading } = useGoogleAuthRedirect(redirectTo)

  React.useEffect(() => {
    if (googleError) setError(googleError)
  }, [googleError])

  // Arrivée par un lien de parrainage (code gardé dans le navigateur) : on le rappelle à l'écran.
  const [hasReferral, setHasReferral] = React.useState(false)
  React.useEffect(() => { setHasReferral(!!readReferralCode()) }, [])

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
          body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || undefined, referralCode: readReferralCode() }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? 'Erreur lors de la création du profil')
        }
        clearReferralCode()
        document.cookie = 'br_session=1; path=/; max-age=86400; SameSite=Strict'
        router.replace((redirectTo || CLIENT_HOME) as never)
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

  const loginHref = redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'

  return (
    <div className="client-theme" style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 32px', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', height: 40 }}>
          <BrandLogo />
        </header>

        <h1 style={{ ...pageTitle, margin: '40px 0 8px' }}>Créer un compte</h1>
        <p style={{ margin: '0 0 24px', fontSize: 15, color: C.muted }}>Pour réserver tes séances en quelques secondes.</p>

        {hasReferral && (
          <div style={{ ...card, background: C.graphite, color: '#fff', display: 'flex', alignItems: 'center', gap: 14, padding: 16, marginBottom: 20 }}>
            <span style={{ ...iconCircle, background: 'rgba(255,255,255,0.12)' }}><Gift size={18} strokeWidth={1.75} /></span>
            <span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Ta première séance est offerte</span>
              <span style={{ display: 'block', fontSize: 13, opacity: 0.75, marginTop: 2 }}>Grâce au parrainage, elle sera gratuite.</span>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field id="firstName" label="Prénom">
              <input id="firstName" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
            </Field>
            <Field id="lastName" label="Nom">
              <input id="lastName" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <Field id="email" label="Email">
            <input
              id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@email.ch" style={inputStyle}
            />
          </Field>
          <Field id="phone" label="Téléphone">
            <input
              id="phone" type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+41 79 000 00 00" style={inputStyle}
            />
          </Field>
          <Field id="password" label="Mot de passe">
            <div style={{ position: 'relative' }}>
              <input
                id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 caractères minimum"
                style={{ ...inputStyle, paddingRight: 52 }}
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

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 16, background: C.redBg, color: C.red, fontSize: 14, lineHeight: 1.4 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...primaryButton, height: 52, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Création…' : 'Créer mon compte'}
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

        <div style={{ ...card, marginTop: 28, display: 'flex', alignItems: 'center', gap: 12, background: C.stone }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Déjà un compte ?</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>Connecte-toi pour retrouver tes réservations.</p>
          </div>
          <Link href={loginHref as never} style={{ ...secondaryButton, height: 40, padding: '0 16px' }}>Connexion</Link>
        </div>
      </div>
    </div>
  )
}
