'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from './useAuth'

const DEFAULT_CANCELLATION_DEADLINE_HOURS = 24

/** Réglages entreprise utiles à l'espace client (settings/global, lisible par tout compte connecté). */
export function useClientSettings() {
  const { firebaseUser } = useAuth()
  const [deadlineHours, setDeadlineHours] = useState(DEFAULT_CANCELLATION_DEADLINE_HOURS)
  const [whatsappPhone, setWhatsappPhone] = useState('')

  useEffect(() => {
    if (!firebaseUser) return
    getDoc(doc(db, 'settings', 'global')).then(snap => {
      const data = snap.data()
      setDeadlineHours((data?.['groupSessionCancellationDeadlineHours'] as number | undefined) ?? DEFAULT_CANCELLATION_DEADLINE_HOURS)
      setWhatsappPhone((data?.['clientWhatsappPhone'] as string | undefined) ?? '')
    }).catch(() => {})
  }, [firebaseUser])

  return { deadlineHours, whatsappPhone }
}
