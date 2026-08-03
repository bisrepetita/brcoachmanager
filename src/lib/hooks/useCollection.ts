'use client'

import { useState, useEffect } from 'react'
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  type Query,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'

export function useCollection<T extends { id: string }>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!enabled) {
      setData([])
      setLoading(false)
      return
    }

    const ref = collection(db, collectionName)
    const q: Query<DocumentData> = constraints.length
      ? query(ref, ...constraints)
      : query(ref, orderBy('createdAt', 'desc'))

    setLoading(true)
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T)))
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return unsub
  }, [collectionName, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error }
}
