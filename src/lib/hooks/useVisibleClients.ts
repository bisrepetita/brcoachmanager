'use client'

import { useMemo } from 'react'
import { orderBy, where } from 'firebase/firestore'
import { useAuth } from './useAuth'
import { useCollection } from './useCollection'
import type { Client } from '@/types'

// La règle Firestore canReadClient() est `isAdmin() || (isCoach() && (visibleToCoachIds vide OU
// contient mon uid))`. Pour un admin, isAdmin() suffit à elle seule (indépendante de resource.data)
// — Firestore autorise une liste non filtrée. Pour un coach non-admin, la condition dépend de
// resource.data : Firestore refuse alors la liste ENTIÈREMENT si la requête n'a pas de where()
// correspondant (même pattern que "list query non prouvable" déjà rencontré ailleurs dans ce
// projet) — d'où deux requêtes filtrées à fusionner, impossible à exprimer en une seule requête
// Firestore (pas de OR entre array-contains et égalité sur le même champ).
export function useVisibleClients(sortField: 'firstName' | 'lastName' = 'firstName') {
  const { isAdmin, firebaseUser, loading: authLoading } = useAuth()
  const uid = firebaseUser?.uid

  const { data: adminClients, loading: loadingAdmin } = useCollection<Client>(
    'clients', [orderBy(sortField)], { enabled: isAdmin === true }
  )
  const { data: mineClients, loading: loadingMine } = useCollection<Client>(
    'clients', uid ? [where('visibleToCoachIds', 'array-contains', uid)] : [],
    { enabled: isAdmin === false && !!uid }
  )
  const { data: universalClients, loading: loadingUniversal } = useCollection<Client>(
    'clients', [where('visibleToCoachIds', '==', [])], { enabled: isAdmin === false }
  )

  const data = useMemo(() => {
    if (isAdmin) return adminClients
    const map = new Map<string, Client>()
    ;[...mineClients, ...universalClients].forEach(c => map.set(c.id, c))
    return [...map.values()].sort((a, b) => (a[sortField] ?? '').localeCompare(b[sortField] ?? ''))
  }, [isAdmin, adminClients, mineClients, universalClients, sortField])

  const loading = authLoading || (isAdmin ? loadingAdmin : (loadingMine || loadingUniversal))
  return { data, loading }
}
