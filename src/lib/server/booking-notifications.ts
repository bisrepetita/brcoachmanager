import type { Firestore, Timestamp } from 'firebase-admin/firestore'
import { sendEmail } from './email'
import { groupSessionConfirmationEmail, coachNewEnrollmentEmail, subscriptionConfirmationEmail } from './email-templates'

function formatDateTime(d: Date): string {
  const date = d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  return `${date} à ${time}`
}

async function resolveAccessInstructions(adminDb: Firestore, locationId?: string): Promise<string | undefined> {
  if (!locationId) return undefined
  const locSnap = await adminDb.collection('locations').doc(locationId).get()
  if (!locSnap.exists) return undefined
  const buildingId = locSnap.data()?.['buildingId'] as string | undefined
  if (!buildingId) return undefined
  const buildingSnap = await adminDb.collection('buildings').doc(buildingId).get()
  if (!buildingSnap.exists) return undefined
  return buildingSnap.data()?.['accessInstructions'] as string | undefined
}

/**
 * Notifie par email la réservation d'une séance collective — best-effort (jamais d'exception
 * propagée, un échec d'email ne doit jamais faire échouer une réservation/un paiement).
 * `notifyClient` et `notifyCoaches` sont indépendants : le coach est notifié dès l'inscription
 * (même si le paiement Stripe est encore en attente), le client n'est notifié qu'une fois la
 * réservation définitivement confirmée (gratuite/couverte tout de suite, ou payée via le webhook).
 */
export async function notifyGroupSessionBooking(adminDb: Firestore, opts: {
  groupSessionId: string
  clientId: string
  notifyClient: boolean
  notifyCoaches: boolean
  amountPaid: number
  paymentLabel: string
}): Promise<void> {
  try {
    const [gsSnap, clientSnap] = await Promise.all([
      adminDb.collection('groupSessions').doc(opts.groupSessionId).get(),
      adminDb.collection('clients').doc(opts.clientId).get(),
    ])
    if (!gsSnap.exists || !clientSnap.exists) return

    const gs = gsSnap.data()!
    const client = clientSnap.data()!
    const sessionTitle = gs['title'] as string
    const dateStr = formatDateTime((gs['startAt'] as Timestamp).toDate())
    const clientFirstName = (client['firstName'] as string) ?? ''
    const clientName = `${clientFirstName} ${client['lastName'] ?? ''}`.trim()

    if (opts.notifyClient) {
      const clientEmail = client['email'] as string | undefined
      if (clientEmail) {
        const accessInstructions = await resolveAccessInstructions(adminDb, gs['locationId'] as string | undefined)
        const { subject, html } = groupSessionConfirmationEmail({
          clientFirstName, sessionTitle, dateStr,
          amountPaid: opts.amountPaid, paymentLabel: opts.paymentLabel, accessInstructions,
        })
        await sendEmail({ to: clientEmail, subject, html })
      }
    }

    if (opts.notifyCoaches) {
      const coachIds = (gs['coachIds'] as string[] | undefined) ?? []
      const coachSnaps = await Promise.all(coachIds.map(id => adminDb.collection('users').doc(id).get()))
      await Promise.all(coachSnaps.map(async (snap) => {
        if (!snap.exists) return
        const coachEmail = snap.data()?.['email'] as string | undefined
        if (!coachEmail) return
        const { subject, html } = coachNewEnrollmentEmail({
          coachFirstName: (snap.data()?.['firstName'] as string) ?? '',
          clientName, sessionTitle, dateStr, paymentLabel: opts.paymentLabel,
        })
        await sendEmail({ to: coachEmail, subject, html })
      }))
    }
  } catch (err) {
    console.error('[booking-notifications] notifyGroupSessionBooking erreur non bloquante:', err)
  }
}

export async function notifySubscriptionPurchase(adminDb: Firestore, opts: {
  clientId: string
  planName: string
  price: number
  endAt: Timestamp
}): Promise<void> {
  try {
    const clientSnap = await adminDb.collection('clients').doc(opts.clientId).get()
    if (!clientSnap.exists) return
    const client = clientSnap.data()!
    const clientEmail = client['email'] as string | undefined
    if (!clientEmail) return

    const endDateStr = opts.endAt.toDate().toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
    const { subject, html } = subscriptionConfirmationEmail({
      clientFirstName: (client['firstName'] as string) ?? '',
      planName: opts.planName, price: opts.price, endDateStr,
    })
    await sendEmail({ to: clientEmail, subject, html })
  } catch (err) {
    console.error('[booking-notifications] notifySubscriptionPurchase erreur non bloquante:', err)
  }
}
