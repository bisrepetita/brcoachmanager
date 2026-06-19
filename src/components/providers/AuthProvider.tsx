'use client'

import * as React from 'react'
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth'
import { doc, getDoc, getDocFromCache } from 'firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/firestore'
import type { User, UserRole } from '@/types'

interface AuthState {
  firebaseUser: FirebaseUser | null
  user: User | null
  loading: boolean
  isAdmin: boolean
  isCoach: boolean
  logout: () => Promise<void>
}

export const AuthContext = React.createContext<AuthState | null>(null)

// Module-level cache: survives HMR remounts.
// When Turbopack recreates DynamicAuthProvider and remounts AuthProvider,
// useState reads from here instead of resetting to loading=true.
const _cache = {
  loading: true,
  firebaseUser: null as FirebaseUser | null,
  user: null as User | null,
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = React.useState<FirebaseUser | null>(_cache.firebaseUser)
  const [user, setUser] = React.useState<User | null>(_cache.user)
  const [loading, setLoading] = React.useState(_cache.loading)

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      _cache.firebaseUser = fbUser
      _cache.loading = false
      setFirebaseUser(fbUser)
      setLoading(false)

      if (!fbUser) {
        _cache.user = null
        setUser(null)
        return
      }

      try {
        const userRef = doc(db, 'users', fbUser.uid)
        let snap = await getDocFromCache(userRef).catch(() => null)
        if (!snap) snap = await getDoc(userRef).catch(() => null)
        const resolved = snap?.exists() ? ({ id: snap.id, ...snap.data() } as User) : null
        _cache.user = resolved
        setUser(resolved)
      } catch {
        _cache.user = null
        setUser(null)
      }
    })

    return unsubscribe
  }, [])

  const logout = React.useCallback(async () => {
    await signOut(auth)
    document.cookie = 'br_session=; path=/; max-age=0'
  }, [])

  const roles: UserRole[] = user?.roles ?? []
  const isAdmin = roles.includes('admin')
  const isCoach = roles.includes('coach')

  return (
    <AuthContext.Provider value={{ firebaseUser, user, loading, isAdmin, isCoach, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
