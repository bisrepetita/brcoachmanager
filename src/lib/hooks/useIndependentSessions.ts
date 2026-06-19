import { useMemo } from 'react'
import { where, orderBy } from 'firebase/firestore'
import { useCollection } from './useCollection'
import type { Session, RoomRentalEntry } from '@/types'

export interface IndependentSessionRow {
  session: Session
  entry: RoomRentalEntry
}

export function useIndependentSessions(coachId: string | null) {
  const constraints = useMemo(() =>
    coachId
      ? [where('coachIds', 'array-contains', coachId), orderBy('startAt', 'desc')]
      : [],
    [coachId]
  )

  const { data: allSessions, loading } = useCollection<Session>('sessions', constraints)

  const rows = useMemo((): IndependentSessionRow[] => {
    if (!coachId) return []
    return allSessions
      .filter(s => s.isIndependent && s.roomRentalSnapshot)
      .flatMap(s => {
        const entry = s.roomRentalSnapshot!.find(e => e.coachId === coachId)
        return entry ? [{ session: s, entry }] : []
      })
  }, [allSessions, coachId])

  const pending = useMemo(() => rows.filter(r => r.entry.status === 'pending'), [rows])
  const resolved = useMemo(() => rows.filter(r => r.entry.status !== 'pending'), [rows])
  const totalPending = useMemo(() => pending.reduce((sum, r) => sum + r.entry.amountDueToCompany, 0), [pending])

  return { rows, pending, resolved, totalPending, loading }
}
