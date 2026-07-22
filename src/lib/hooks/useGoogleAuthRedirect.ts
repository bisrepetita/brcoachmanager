'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getRedirectResult, signOut, type AuthError } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/firestore'

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cet email via un autre mode de connexion — connecte-toi avec ton mot de passe.',
  'auth/network-request-failed': 'Problème de connexion réseau.',
  'auth/user-disabled': 'Ce compte a été désactivé.',
}

/**
 * Traite le retour de `signInWithRedirect` (Google) au chargement de la page : compte existant →
 * connexion normale (redirection selon rôle) ; compte inconnu → traité comme un signup client
 * (les coachs sont toujours créés par l'admin en amont, jamais via ce chemin).
 */
export function useGoogleAuthRedirect() {
  const router = useRouter()
  const [checkingRedirect, setCheckingRedirect] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    getRedirectResult(auth).then(async (result) => {
      if (!result) { setCheckingRedirect(false); return }

      const user = result.user
      const userSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null)

      if (userSnap?.exists()) {
        document.cookie = 'br_session=1; path=/; max-age=86400; SameSite=Strict'
        const roles = (userSnap.data()?.['roles'] as string[] | undefined) ?? []
        const isOnlyClient = roles.includes('client') && !roles.includes('coach') && !roles.includes('admin')
        router.replace(isOnlyClient ? '/group-sessions' : '/calendar')
        return
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
      } catch (err) {
        await signOut(auth).catch(() => {})
        setError(err instanceof Error ? err.message : 'Erreur lors de la création du profil. Réessaie.')
        setCheckingRedirect(false)
      }
    }).catch((err: AuthError) => {
      setError(GOOGLE_ERROR_MESSAGES[err.code] ?? 'Erreur lors de la connexion avec Google.')
      setCheckingRedirect(false)
    })
  }, [router])

  return { checkingRedirect, error, setError }
}
