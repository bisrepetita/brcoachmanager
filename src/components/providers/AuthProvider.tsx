'use client'

import * as React from 'react'
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/firestore'
import type { User, UserRole } from '@/types'

interface AuthState {
  firebaseUser: FirebaseUser | null
  user: User | null
  loading: boolean
  isAdmin: boolean
  isCoach: boolean
  isClient: boolean
  logout: () => Promise<void>
}

export const AuthContext = React.createContext<AuthState | null>(null)

// Module-level cache: survives HMR remounts (when Turbopack recreates DynamicAuthProvider and
// remounts AuthProvider, useState reads from here instead of resetting to loading=true).
// UNIQUEMENT lu/écrit côté navigateur : ce module tourne aussi côté serveur (SSR/RSC, 'use client'
// n'empêche pas le premier rendu serveur) où il vit dans le process Node — un objet mutable au
// niveau module y est partagé entre TOUTES les requêtes concurrentes de TOUS les visiteurs. Un
// visiteur anonyme pouvait ainsi hériter, le temps du premier rendu, de l'état d'authentification
// laissé par une requête précédente d'un autre utilisateur sur ce même process serveur.
const isBrowser = typeof window !== 'undefined'
const _cache = {
  loading: true,
  firebaseUser: null as FirebaseUser | null,
  user: null as User | null,
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = React.useState<FirebaseUser | null>(isBrowser ? _cache.firebaseUser : null)
  const [user, setUser] = React.useState<User | null>(isBrowser ? _cache.user : null)
  const [loading, setLoading] = React.useState(isBrowser ? _cache.loading : true)

  React.useEffect(() => {
    let unsubUserDoc: (() => void) | undefined

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      unsubUserDoc?.()
      unsubUserDoc = undefined

      _cache.firebaseUser = fbUser
      setFirebaseUser(fbUser)

      if (!fbUser) {
        _cache.user = null
        _cache.loading = false
        setUser(null)
        setLoading(false)
        return
      }

      // `loading` ne repasse à false qu'une fois le PROFIL chargé (pas juste l'auth Firebase) :
      // sinon AuthGuard évalue isAdmin/isClient sur un état transitoire (user encore null) et
      // redirige à tort, y compris pour un compte légitime, à chaque chargement de page frais.
      // Listener temps réel plutôt qu'une lecture ponctuelle : juste après un signup, le doc
      // `users/{uid}` peut ne pas encore exister côté serveur (écrit par /api/client-signup,
      // en parallèle de ce callback) — un onSnapshot se corrige automatiquement dès qu'il
      // apparaît, alors qu'une lecture unique resterait bloquée sur ce faux négatif.
      const userRef = doc(db, 'users', fbUser.uid)
      unsubUserDoc = onSnapshot(userRef, (snap) => {
        const resolved = snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null
        _cache.user = resolved
        _cache.loading = false
        setUser(resolved)
        setLoading(false)
      }, () => {
        _cache.user = null
        _cache.loading = false
        setUser(null)
        setLoading(false)
      })
    })

    return () => {
      unsubscribe()
      unsubUserDoc?.()
    }
  }, [])

  const logout = React.useCallback(async () => {
    await signOut(auth)
    document.cookie = 'br_session=; path=/; max-age=0'
  }, [])

  const roles: UserRole[] = user?.roles ?? []
  const isAdmin = roles.includes('admin')
  const isCoach = roles.includes('coach')
  const isClient = roles.includes('client')

  return (
    <AuthContext.Provider value={{ firebaseUser, user, loading, isAdmin, isCoach, isClient, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
