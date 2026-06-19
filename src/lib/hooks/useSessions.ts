'use client'

import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { Session } from '@/types'

export function useSessions(start: Date, end: Date) {
  const { user, isAdmin } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const startMs = start.getTime()
  const endMs = end.getTime()

  useEffect(() => {
    if (!user) {
      setLoading(false)
      setSessions([])
      return
    }
    setLoading(true)

    // Stratégie sans index composite :
    // Admin  → range sur startAt (index auto Firestore sur champ unique)
    // Coach  → array-contains seul, filtre date côté client
    // Les deux évitent les requêtes combinées qui nécessitent des index déployés.
    if (isAdmin) {
      const q = query(
        collection(db, 'sessions'),
        where('startAt', '>=', Timestamp.fromDate(new Date(startMs))),
        where('startAt', '<=', Timestamp.fromDate(new Date(endMs))),
      )
      const unsub = onSnapshot(
        q,
        snap => {
          setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Session)))
          setLoading(false)
        },
        () => setLoading(false)
      )
      return unsub
    } else {
      const q = query(collection(db, 'sessions'), where('coachIds', 'array-contains', user.id))
      const unsub = onSnapshot(
        q,
        snap => {
          const inRange = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as Session))
            .filter(s => {
              const t = s.startAt?.toDate().getTime()
              return t !== undefined && t >= startMs && t <= endMs
            })
          setSessions(inRange)
          setLoading(false)
        },
        () => setLoading(false)
      )
      return unsub
    }
  }, [startMs, endMs, user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  return { sessions, loading }
}
