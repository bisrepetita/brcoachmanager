import {
  collection, query, where, getDocs, doc, getDoc,
  writeBatch, Timestamp, orderBy, limit, serverTimestamp,
} from 'firebase/firestore'
import { addMinutes } from 'date-fns'
import { db } from '@/lib/firebase/firestore'
import type { Recurrence, Session, ClientPayment } from '@/types'

function nextOccurrence(date: Date, frequency: string): Date {
  const next = new Date(date)
  if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  else if (frequency === 'biweekly') next.setDate(next.getDate() + 14)
  else next.setMonth(next.getMonth() + 1)
  return next
}

function generateFrom(
  from: Date,
  frequency: string,
  duration: number,
  monthsAhead: number
): Date[] {
  const until = new Date(from.getFullYear(), from.getMonth() + monthsAhead, from.getDate())
  const dates: Date[] = []
  let current = nextOccurrence(from, frequency)
  while (current <= until) {
    dates.push(new Date(current))
    current = nextOccurrence(current, frequency)
  }
  return dates
}

// Vérifie toutes les récurrences infinies et prolonge si la dernière séance est < 30 jours
export async function extendInfiniteRecurrences(): Promise<void> {
  const recSnap = await getDocs(
    query(collection(db, 'recurrences'), where('rule.infinite', '==', true))
  )
  if (recSnap.empty) return

  const horizon = new Date()
  horizon.setDate(horizon.getDate() + 30)

  for (const recDoc of recSnap.docs) {
    const rec = { id: recDoc.id, ...recDoc.data() } as Recurrence

    // Trouver la dernière séance de cette récurrence
    const lastSnap = await getDocs(
      query(
        collection(db, 'sessions'),
        where('recurrenceId', '==', rec.id),
        orderBy('startAt', 'desc'),
        limit(1)
      )
    )
    if (lastSnap.empty) continue

    const lastSession = lastSnap.docs[0]!
    const lastDate: Date = (lastSession.data() as Session).startAt.toDate()

    // Si la dernière séance dépasse l'horizon de 30 jours, pas besoin d'étendre
    if (lastDate > horizon) continue

    // Récupérer le modèle de la dernière séance pour reproduire les données
    const templateData = lastSession.data() as Session

    // Générer les nouvelles occurrences (3 mois depuis la dernière séance)
    const newDates = generateFrom(lastDate, rec.rule.frequency, rec.rule.duration, 3)
    if (newDates.length === 0) continue

    const batch = writeBatch(db)
    for (const occDate of newDates) {
      const sessRef = doc(collection(db, 'sessions'))

      const pricePerClient = templateData.priceSnapshot.pricingMode === 'per_person'
        ? templateData.priceSnapshot.basePrice
        : templateData.clientIds.length > 0
          ? Math.round((templateData.priceSnapshot.basePrice / templateData.clientIds.length) * 100) / 100
          : 0

      const paymentDistribution: ClientPayment[] = templateData.clientIds.map(cId => ({
        clientId: cId, amountDue: pricePerClient, amountPaid: 0, paymentStatus: 'payment_to_request',
      }))

      batch.set(sessRef, {
        coachIds: templateData.coachIds,
        clientIds: templateData.clientIds,
        ...(templateData.clientGroupId ? { clientGroupId: templateData.clientGroupId } : {}),
        locationId: templateData.locationId,
        serviceId: templateData.serviceId,
        isIndependent: templateData.isIndependent,
        status: 'planned',
        paymentStatus: 'payment_to_request',
        paymentDistribution,
        priceSnapshot: templateData.priceSnapshot,
        recurrenceId: rec.id,
        startAt: Timestamp.fromDate(occDate),
        endAt: Timestamp.fromDate(addMinutes(occDate, rec.rule.duration)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }

    await batch.commit()
  }
}
