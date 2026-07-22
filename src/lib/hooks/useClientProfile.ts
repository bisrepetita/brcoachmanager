'use client'

import { useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/config'
import { useAuth } from './useAuth'

export interface ClientProfile {
  clientId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  sessionCredits: number
  hasEverBooked: boolean
}

export function useClientProfile() {
  const { firebaseUser } = useAuth()
  const [profile, setProfile] = useState<ClientProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firebaseUser) { setProfile(null); setLoading(false); return }

    let cancelled = false
    setLoading(true)

    getAuth(firebaseApp).currentUser?.getIdToken()
      .then((token) => fetch('/api/client-profile', { headers: { Authorization: `Bearer ${token}` } }))
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!cancelled) setProfile(data) })
      .catch(() => { if (!cancelled) setProfile(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [firebaseUser])

  return { profile, loading }
}
