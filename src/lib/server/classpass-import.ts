import { randomUUID } from 'crypto'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { ParsedClassPassBooking, ParsedClassPassCancellation } from './classpass-parser'
import { notifyGroupSessionBooking } from './booking-notifications'

// Montant reversé par ClassPass au studio pour chaque séance réservée via leur plateforme —
// fixe, indépendant du prix normal du service (payé par le membre à ClassPass, pas à nous).
const CLASSPASS_PAYOUT_CHF = 30

const MATCH_WINDOW_MS = 15 * 60 * 1000

export interface ClassPassImportResult {
  status: 'matched' | 'unmatched' | 'error' | 'duplicate'
  importId?: string
  groupSessionId?: string
  clientId?: string
  errorReason?: string
}

export async function importClassPassBooking(
  adminDb: Firestore,
  parsed: ParsedClassPassBooking,
  baseUrl: string,
): Promise<ClassPassImportResult> {
  const dupSnap = await adminDb.collection('classPassImports')
    .where('classPassBookingId', '==', parsed.bookingId)
    .limit(1)
    .get()
  if (!dupSnap.empty) {
    return { status: 'duplicate', importId: dupSnap.docs[0]!.id }
  }

  const importRef = adminDb.collection('classPassImports').doc()
  const baseImportDoc = {
    classPassBookingId: parsed.bookingId,
    memberName: parsed.memberName,
    memberEmail: parsed.memberEmail,
    serviceTitle: parsed.serviceTitle,
    parsedStartAt: Timestamp.fromDate(parsed.sessionDateTime),
    createdAt: FieldValue.serverTimestamp(),
  }

  const from = Timestamp.fromMillis(parsed.sessionDateTime.getTime() - MATCH_WINDOW_MS)
  const to = Timestamp.fromMillis(parsed.sessionDateTime.getTime() + MATCH_WINDOW_MS)
  const candidatesSnap = await adminDb.collection('groupSessions')
    .where('startAt', '>=', from)
    .where('startAt', '<=', to)
    .get()

  const normalizedTitle = parsed.serviceTitle.trim().toLowerCase()
  const candidates = candidatesSnap.docs
    .filter((d) => ((d.data()['title'] as string | undefined) ?? '').trim().toLowerCase() === normalizedTitle)
    .sort((a, b) =>
      Math.abs((a.data()['startAt'] as Timestamp).toMillis() - parsed.sessionDateTime.getTime()) -
      Math.abs((b.data()['startAt'] as Timestamp).toMillis() - parsed.sessionDateTime.getTime()))

  const groupSessionDoc = candidates[0]
  if (!groupSessionDoc) {
    await importRef.set({ ...baseImportDoc, status: 'unmatched' })
    await logActivity(adminDb, 'group_session_classpass_unmatched',
      `Aucune séance "${parsed.serviceTitle}" trouvée pour le ${parsed.sessionDateTime.toISOString()} (réservation ClassPass ${parsed.bookingId}, ${parsed.memberName})`)
    return { status: 'unmatched', importId: importRef.id }
  }
  const groupSessionRef = groupSessionDoc.ref

  const clientMatches = await adminDb.collection('clients').where('email', '==', parsed.memberEmail).limit(1).get()
  let clientId: string
  if (!clientMatches.empty) {
    clientId = clientMatches.docs[0]!.id
  } else {
    const newClientRef = adminDb.collection('clients').doc()
    clientId = newClientRef.id
    await newClientRef.set({
      firstName: parsed.memberFirstName,
      lastName: parsed.memberLastName || parsed.memberFirstName,
      email: parsed.memberEmail,
      sessionCredits: 0,
      visibleToCoachIds: [],
      hasEverBooked: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  const enrollResult = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(groupSessionRef)
    if (!snap.exists) return { ok: false as const, reason: 'seance_supprimee' }
    const data = snap.data()!
    if (data['status'] !== 'planned') return { ok: false as const, reason: 'seance_non_disponible' }

    const enrollments = (data['enrollments'] as Array<Record<string, unknown>> | undefined) ?? []
    if (enrollments.some((e) => e['clientId'] === clientId && e['status'] !== 'cancelled')) {
      return { ok: false as const, reason: 'deja_inscrit' }
    }
    const activeCount = enrollments.filter((e) => e['status'] !== 'cancelled').length
    if (activeCount >= (data['maxParticipants'] as number)) {
      return { ok: false as const, reason: 'seance_complete' }
    }

    const entry = {
      id: randomUUID(),
      clientId,
      status: 'confirmed',
      amountDue: CLASSPASS_PAYOUT_CHF,
      amountPaid: CLASSPASS_PAYOUT_CHF,
      paymentStatus: 'paid',
      classPassBookingId: parsed.bookingId,
      enrolledAt: Timestamp.now(),
      paidAt: Timestamp.now(),
    }
    tx.update(groupSessionRef, { enrollments: [...enrollments, entry], updatedAt: FieldValue.serverTimestamp() })
    return { ok: true as const, entry }
  })

  if (!enrollResult.ok) {
    await importRef.set({ ...baseImportDoc, status: 'error', groupSessionId: groupSessionRef.id, clientId, errorMessage: enrollResult.reason })
    await logActivity(adminDb, 'group_session_classpass_error',
      `Échec import ClassPass "${parsed.serviceTitle}" (${parsed.bookingId}, ${parsed.memberName}) : ${enrollResult.reason}`, groupSessionRef.id, clientId)
    return { status: 'error', importId: importRef.id, groupSessionId: groupSessionRef.id, clientId, errorReason: enrollResult.reason }
  }

  await importRef.set({ ...baseImportDoc, status: 'matched', groupSessionId: groupSessionRef.id, clientId })
  await logActivity(adminDb, 'group_session_classpass_import',
    `${parsed.memberName} inscrit(e) via ClassPass à "${parsed.serviceTitle}" (${parsed.bookingId})`, groupSessionRef.id, clientId)

  // Le membre a déjà reçu sa confirmation de ClassPass — on n'envoie pas de doublon, seulement la
  // notification coach habituelle.
  await notifyGroupSessionBooking(adminDb, {
    groupSessionId: groupSessionRef.id,
    clientId,
    notifyCoaches: true,
    notifyClient: false,
    amountPaid: CLASSPASS_PAYOUT_CHF,
    paymentLabel: 'Payé (ClassPass)',
    baseUrl,
  })

  return { status: 'matched', importId: importRef.id, groupSessionId: groupSessionRef.id, clientId }
}

export interface ClassPassCancelResult {
  status: 'cancelled' | 'already_cancelled' | 'unknown_booking' | 'no_enrollment' | 'error'
  groupSessionId?: string
  clientId?: string
  errorReason?: string
}

export async function cancelClassPassBooking(
  adminDb: Firestore,
  cancellation: ParsedClassPassCancellation,
): Promise<ClassPassCancelResult> {
  const importSnap = await adminDb.collection('classPassImports')
    .where('classPassBookingId', '==', cancellation.bookingId)
    .limit(1)
    .get()

  const memberSuffix = cancellation.memberName ? `, ${cancellation.memberName}` : ''

  if (importSnap.empty) {
    await logActivity(adminDb, 'group_session_classpass_unmatched',
      `Annulation ClassPass reçue pour une réservation inconnue (${cancellation.bookingId}${memberSuffix}) — aucune action`)
    return { status: 'unknown_booking' }
  }

  const importData = importSnap.docs[0]!.data() as { status: string; groupSessionId?: string; clientId?: string }
  if (importData.status !== 'matched' || !importData.groupSessionId) {
    // La réservation d'origine n'avait jamais abouti à une inscription (séance introuvable, erreur) — rien à annuler.
    return { status: 'no_enrollment' }
  }

  const groupSessionRef = adminDb.collection('groupSessions').doc(importData.groupSessionId)

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(groupSessionRef)
    if (!snap.exists) return { ok: false as const, reason: 'seance_introuvable' }
    const data = snap.data()!
    const enrollments = (data['enrollments'] as Array<Record<string, unknown>> | undefined) ?? []
    const idx = enrollments.findIndex((e) => e['classPassBookingId'] === cancellation.bookingId)
    if (idx === -1) return { ok: false as const, reason: 'inscription_introuvable' }

    const entry = enrollments[idx]!
    if (entry['status'] === 'cancelled') return { ok: true as const, alreadyCancelled: true }

    const updated = [...enrollments]
    updated[idx] = { ...entry, status: 'cancelled', cancelledAt: Timestamp.now() }
    tx.update(groupSessionRef, { enrollments: updated, updatedAt: FieldValue.serverTimestamp() })
    return { ok: true as const, alreadyCancelled: false }
  })

  if (!result.ok) {
    await logActivity(adminDb, 'group_session_classpass_error',
      `Échec annulation ClassPass (${cancellation.bookingId}${memberSuffix}) : ${result.reason}`, importData.groupSessionId, importData.clientId)
    return { status: 'error', groupSessionId: importData.groupSessionId, clientId: importData.clientId, errorReason: result.reason }
  }

  if (result.alreadyCancelled) {
    return { status: 'already_cancelled', groupSessionId: importData.groupSessionId, clientId: importData.clientId }
  }

  // Le paiement ClassPass (30 CHF) reste comptabilisé tel quel (paymentStatus inchangé) — même
  // logique qu'une annulation manuelle après paiement, à corriger à la main si ClassPass reverse
  // effectivement le montant en cas d'annulation.
  await logActivity(adminDb, 'group_session_cancelled_after_payment',
    `Inscription annulée via ClassPass (${cancellation.bookingId}${memberSuffix})`, importData.groupSessionId, importData.clientId)

  return { status: 'cancelled', groupSessionId: importData.groupSessionId, clientId: importData.clientId }
}

async function logActivity(adminDb: Firestore, action: string, description: string, sessionId?: string, clientId?: string): Promise<void> {
  await adminDb.collection('activityLogs').add({
    userId: 'classpass-import',
    userFirstName: 'ClassPass',
    userLastName: '',
    action,
    description,
    ...(sessionId ? { sessionId } : {}),
    ...(clientId ? { clientId } : {}),
    createdAt: FieldValue.serverTimestamp(),
  })
}
