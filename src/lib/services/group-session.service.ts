import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/config'
import type { GroupSessionEnrollment, PaymentStatus } from '@/types'

async function callApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const auth = getAuth(firebaseApp)
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Non authentifié')

  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `HTTP ${res.status}`
    try { message = (JSON.parse(text) as { error: string }).error ?? message } catch { message = text || message }
    throw new Error(message)
  }

  return (await res.json()) as T
}

export function enrollInGroupSession(groupSessionId: string, promoCode?: string): Promise<{ enrollment: GroupSessionEnrollment; checkoutUrl?: string }> {
  return callApi('/api/group-sessions/enroll', { groupSessionId, ...(promoCode ? { promoCode } : {}) })
}

export function cancelGroupSessionEnrollment(groupSessionId: string): Promise<{ ok: true }> {
  return callApi('/api/group-sessions/cancel', { groupSessionId })
}

/** Annulation d'un participant par le coach/admin — pas de délai, pas de vérification que c'est
 * "son" inscription. `target.enrollmentId` pour un invité (pas de clientId), sinon `target.clientId`. */
export function adminCancelGroupSessionEnrollment(groupSessionId: string, target: { clientId?: string; enrollmentId?: string }): Promise<{ ok: true }> {
  return callApi('/api/group-sessions/admin-cancel-enrollment', { groupSessionId, ...target })
}

/** Ajoute un invité (pas de fiche `clients` créée) à une séance collective — réservé coach/admin. */
export function adminAddGuestToGroupSession(
  groupSessionId: string, opts: { guestName: string; paymentStatus: PaymentStatus; amountPaid?: number }
): Promise<{ enrollment: GroupSessionEnrollment }> {
  return callApi('/api/group-sessions/admin-add-guest', { groupSessionId, ...opts })
}

/** Ajoute un client existant à une séance collective — réservé coach/admin. Le client reçoit le
 * même mail de confirmation qu'une réservation en self-service. */
export function adminAddClientToGroupSession(
  groupSessionId: string, opts: { clientId: string; paymentStatus: PaymentStatus; amountPaid?: number }
): Promise<{ enrollment: GroupSessionEnrollment; isNewToBooking: boolean }> {
  return callApi('/api/group-sessions/admin-add-client', { groupSessionId, ...opts })
}

export function requestGroupSessionPaymentLink(groupSessionId: string): Promise<{ checkoutUrl: string }> {
  return callApi('/api/group-sessions/request-payment-link', { groupSessionId })
}

export function checkGroupSessionOverlap(groupSessionId: string): Promise<{ hasOverlap: boolean }> {
  return callApi('/api/group-sessions/check-overlap', { groupSessionId })
}
