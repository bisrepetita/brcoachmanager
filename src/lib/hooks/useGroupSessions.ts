'use client'

import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { GroupSession } from '@/types'

export function useGroupSessions(start: Date, end: Date) {
  const { user, isAdmin } = useAuth()
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([])
  const [loading, setLoading] = useState(true)

  const startMs = start.getTime()
  const endMs = end.getTime()

  useEffect(() => {
    if (!user) {
      setLoading(false)
      setGroupSessions([])
      return
    }
    setLoading(true)

    if (isAdmin) {
      const q = query(
        collection(db, 'groupSessions'),
        where('startAt', '>=', Timestamp.fromDate(new Date(startMs))),
        where('startAt', '<=', Timestamp.fromDate(new Date(endMs))),
      )
      const unsub = onSnapshot(
        q,
        snap => {
          setGroupSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupSession)))
          setLoading(false)
        },
        () => setLoading(false)
      )
      return unsub
    } else {
      const q = query(collection(db, 'groupSessions'), where('coachIds', 'array-contains', user.id))
      const unsub = onSnapshot(
        q,
        snap => {
          const inRange = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as GroupSession))
            .filter(gs => {
              const t = gs.startAt?.toDate().getTime()
              return t !== undefined && t >= startMs && t <= endMs
            })
          setGroupSessions(inRange)
          setLoading(false)
        },
        () => setLoading(false)
      )
      return unsub
    }
  }, [startMs, endMs, user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  return { groupSessions, loading }
}
