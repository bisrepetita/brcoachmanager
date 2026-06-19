'use client'

import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'

export function useToCloseCount(): number {
  const { user, isAdmin } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) { setCount(0); return }

    // Un seul filtre par requête → aucun index composite nécessaire.
    // status et endAt filtrés côté client.
    const q = isAdmin
      ? query(collection(db, 'sessions'), where('status', '==', 'planned'))
      : query(collection(db, 'sessions'), where('coachIds', 'array-contains', user.id))

    const now = Date.now()

    return onSnapshot(
      q,
      snap => {
        const pastPlanned = snap.docs.filter(d => {
          const data = d.data()
          if (!isAdmin && data.status !== 'planned') return false
          const endAt = data.endAt
          return endAt && endAt.toDate().getTime() <= now
        })
        setCount(pastPlanned.length)
      },
      () => setCount(0)
    )
  }, [user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  return count
}
