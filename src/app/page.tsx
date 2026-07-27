'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

// Pas de redirection en dur : avant de connaître le rôle réel (ou l'absence de session),
// envoyer tout le monde vers /calendar faisait clignoter le shell coach/admin (BottomNav compris)
// avant que AuthGuard ne renvoie les clients ou les utilisateurs déconnectés au bon endroit.
// Le Planning est consultable sans connexion : un visiteur non connecté atterrit dessus (pas sur
// /login) — seules les actions (réserver, acheter) demandent de se connecter.
export default function RootPage() {
  const { firebaseUser, isClient, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!firebaseUser) {
      router.replace('/group-sessions')
      return
    }
    router.replace(isClient ? '/group-sessions' : '/calendar')
  }, [firebaseUser, isClient, loading, router])

  return null
}
