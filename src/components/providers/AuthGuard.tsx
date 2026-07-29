'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'

interface AuthGuardProps {
  children: React.ReactNode
  requireAdmin?: boolean
  requireClient?: boolean
}

export function AuthGuard({ children, requireAdmin = false, requireClient = false }: AuthGuardProps) {
  const { firebaseUser, isAdmin, isCoach, isClient, loading } = useAuth()
  const router = useRouter()

  // Espace client : réservé aux comptes ayant le rôle 'client'.
  // Espace coach/admin (par défaut) : réservé aux comptes ayant explicitement le rôle 'coach' ou
  // 'admin' — PAS juste "pas client". Juste après une inscription, `roles` peut être transitoirement
  // vide (doc `users/{uid}` pas encore chargé) : avec un test "pas client", ce compte tout neuf
  // passerait à tort pour un coach et verrait brièvement l'espace coach.
  const denied = requireClient ? !isClient : !isCoach && !isAdmin
  const deniedAdmin = requireAdmin && !isAdmin
  // La cible de redirection dépend du rôle réel de l'utilisateur refusé, pas du guard qui a
  // déclenché le refus — sinon un coach non-admin refusé sur une page admin atterrissait sur
  // l'espace client au lieu de son propre agenda.
  const redirectTo = isClient ? '/group-sessions' : '/calendar'

  useEffect(() => {
    if (loading) return
    if (!firebaseUser) {
      document.cookie = 'br_session=; path=/; max-age=0'
      router.replace('/login')
      return
    }
    if (deniedAdmin || denied) {
      router.replace(redirectTo)
    }
  }, [firebaseUser, deniedAdmin, denied, redirectTo, loading, router])

  if (loading) return <ListSkeleton count={5} />
  if (!firebaseUser) return null
  if (deniedAdmin || denied) return null

  return <>{children}</>
}
