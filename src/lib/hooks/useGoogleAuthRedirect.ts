'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getRedirectResult, signInWithPopup, signOut, type AuthError, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, googleProvider } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/firestore'

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cet email via un autre mode de connexion — connecte-toi avec ton mot de passe.',
  'auth/network-request-failed': 'Problème de connexion réseau.',
  'auth/user-disabled': 'Ce compte a été désactivé.',
}

// Comptes existants → connexion normale (redirection selon rôle) ; comptes inconnus → traités
// comme un signup client (les coachs sont toujours créés par l'admin en amont, jamais via ce chemin).
async function finishGoogleSignIn(user: User, router: ReturnType<typeof useRouter>): Promise<string | null> {
  const userSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null)

  if (userSnap?.exists()) {
    document.cookie = 'br_session=1; path=/; max-age=86400; SameSite=Strict'
    const roles = (userSnap.data()?.['roles'] as string[] | undefined) ?? []
    const isOnlyClient = roles.includes('client') && !roles.includes('coach') && !roles.includes('admin')
    router.replace(isOnlyClient ? '/group-sessions' : '/calendar')
    return null
  }

  try {
    const idToken = await user.getIdToken()
    const [firstName, ...rest] = (user.displayName ?? '').trim().split(' ')
    const res = await fetch('/api/client-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ firstName: firstName || 'Client', lastName: rest.join(' ') }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Erreur lors de la création du profil.')
    }
    document.cookie = 'br_session=1; path=/; max-age=86400; SameSite=Strict'
    router.replace('/group-sessions')
    return null
  } catch (err) {
    await signOut(auth).catch(() => {})
    return err instanceof Error ? err.message : 'Erreur lors de la création du profil. Réessaie.'
  }
}

/**
 * Connexion Google via popup (pas signInWithRedirect) : le round-trip par redirection complète
 * dépend de sessionStorage/IndexedDB persistant entre le domaine de l'app et l'authDomain Firebase,
 * ce qui échoue silencieusement dans de nombreux navigateurs (partitionnement du stockage tiers,
 * ITP Safari, etc.) — l'utilisateur choisit son compte Google puis se retrouve renvoyé sur /login
 * sans être connecté. La popup partage la session du navigateur en cours et évite ce problème.
 * getRedirectResult() reste traité au montage comme filet de sécurité pour d'anciens flows en cours.
 */
export function useGoogleAuthRedirect() {
  const router = useRouter()
  const [checkingRedirect, setCheckingRedirect] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    getRedirectResult(auth).then(async (result) => {
      if (!result) { setCheckingRedirect(false); return }
      const err = await finishGoogleSignIn(result.user, router)
      if (err) { setError(err); setCheckingRedirect(false) }
    }).catch((err: AuthError) => {
      setError(GOOGLE_ERROR_MESSAGES[err.code] ?? 'Erreur lors de la connexion avec Google.')
      setCheckingRedirect(false)
    })
  }, [router])

  async function signIn() {
    setError(null)
    setSigningIn(true)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const err = await finishGoogleSignIn(result.user, router)
      if (err) setError(err)
    } catch (e) {
      const code = (e as AuthError)?.code
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(GOOGLE_ERROR_MESSAGES[code] ?? 'Erreur lors de la connexion avec Google.')
      }
    } finally {
      setSigningIn(false)
    }
  }

  return { checkingRedirect, error, setError, signIn, signingIn }
}
