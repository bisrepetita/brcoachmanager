'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'

interface AuthGuardProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { firebaseUser, isAdmin, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!firebaseUser) {
      document.cookie = 'br_session=; path=/; max-age=0'
      router.replace('/login')
      return
    }
    if (requireAdmin && !isAdmin) {
      router.replace('/calendar')
    }
  }, [firebaseUser, isAdmin, loading, requireAdmin, router])

  if (loading) return <ListSkeleton count={5} />
  if (!firebaseUser) return null
  if (requireAdmin && !isAdmin) return null

  return <>{children}</>
}
