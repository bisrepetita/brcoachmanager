'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'

// Force un client connecté sans numéro de téléphone (ex: compte créé via Google, qui ne fournit
// pas ce champ) à le renseigner avant de continuer — quel que soit le chemin par lequel il est
// arrivé là (nouvelle inscription Google, compte existant créé avant que ce champ soit obligatoire,
// etc.), un seul point de contrôle plutôt que de dupliquer la logique dans chaque flow de connexion.
export function PhoneCompletionGuard() {
  const { firebaseUser, isClient, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading } = useClientProfile()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (authLoading || profileLoading) return
    if (!firebaseUser || !isClient || !profile) return
    if (profile.phone) return
    if (pathname === '/complete-profile') return
    router.replace(`/complete-profile?redirect=${encodeURIComponent(pathname)}` as never)
  }, [firebaseUser, isClient, profile, authLoading, profileLoading, pathname, router])

  return null
}
