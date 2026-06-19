import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { createStripeClient, createCheckoutSession } from './stripe'

initializeApp()
const db = getFirestore()

// ─── createPaymentLink ────────────────────────────────────────────────────────
// Génère un lien de paiement Stripe (TWINT + carte) pour un client d'une séance.
// Appelée depuis le client via Firebase httpsCallable('createPaymentLink').

export const createPaymentLink = onCall(
  { region: 'europe-west6' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Non authentifié')

    const { sessionId, clientId } = request.data as {
      sessionId: string
      clientId: string
    }
    if (!sessionId || !clientId) {
      throw new HttpsError('invalid-argument', 'sessionId et clientId requis')
    }

    const sessionRef = db.collection('sessions').doc(sessionId)
    const [sessionSnap, userSnap] = await Promise.all([
      sessionRef.get(),
      db.collection('users').doc(request.auth.uid).get(),
    ])

    if (!sessionSnap.exists) throw new HttpsError('not-found', 'Séance introuvable')

    const session = sessionSnap.data()!
    const userRoles: string[] = (userSnap.data() as { roles?: string[] })?.roles ?? []
    const isAdmin = userRoles.includes('admin')
    const isAssignedCoach = (session['coachIds'] as string[]).includes(request.auth.uid)

    if (!isAdmin && !isAssignedCoach) {
      throw new HttpsError('permission-denied', 'Non autorisé')
    }

    const distribution = (session['paymentDistribution'] as Array<Record<string, unknown>>) ?? []
    const entry = distribution.find((p) => p['clientId'] === clientId)
    if (!entry) throw new HttpsError('not-found', 'Client introuvable dans cette séance')

    const amountCHF = entry['amountDue'] as number

    const clientSnap = await db.collection('clients').doc(clientId).get()
    const client = clientSnap.data() as { firstName: string; lastName: string } | undefined
    const clientName = client ? `${client.firstName} ${client.lastName}` : clientId
    const startAt = (session['startAt'] as { toDate: () => Date }).toDate()
    const dateStr = startAt.toLocaleDateString('fr-CH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    const stripeSecretKey = process.env['STRIPE_SECRET_KEY']
    const returnUrl = process.env['STRIPE_RETURN_URL'] ?? 'https://bisrepetita.ch'
    if (!stripeSecretKey) {
      throw new HttpsError('internal', 'Stripe non configuré (STRIPE_SECRET_KEY manquant)')
    }

    const stripe = createStripeClient(stripeSecretKey)
    const link = await createCheckoutSession({
      stripe,
      amountCHF,
      purpose: `Séance ${dateStr} — ${clientName}`,
      referenceId: `${sessionId}__${clientId}`,
      returnUrl,
    })

    const updated = distribution.map((p) =>
      p['clientId'] === clientId
        ? { ...p, paymentStatus: 'link_sent', twintLink: link }
        : p
    )

    await sessionRef.update({
      paymentDistribution: updated,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return { link }
  }
)

// ─── stripeWebhook ────────────────────────────────────────────────────────────
// Reçoit les événements Stripe (checkout.session.completed).
// URL à configurer dans : Stripe Dashboard → Developers → Webhooks → Add endpoint
// URL après déploiement : https://europe-west6-{projectId}.cloudfunctions.net/stripeWebhook

export const stripeWebhook = onRequest(
  { region: 'europe-west6' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    const stripeSecretKey = process.env['STRIPE_SECRET_KEY']
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET']
    if (!stripeSecretKey || !webhookSecret) {
      res.status(500).send('Stripe non configuré')
      return
    }

    const stripe = createStripeClient(stripeSecretKey)
    const sig = req.headers['stripe-signature'] as string | undefined

    let event
    try {
      // req.rawBody est fourni par Firebase Functions (Buffer du corps brut)
      const raw = (req as unknown as { rawBody: Buffer }).rawBody
      event = stripe.webhooks.constructEvent(raw, sig ?? '', webhookSecret)
    } catch (err) {
      console.error('Stripe signature invalide:', err)
      res.status(400).send('Webhook signature invalid')
      return
    }

    if (event.type !== 'checkout.session.completed') {
      res.status(200).send('Ignored')
      return
    }

    try {
      const checkoutSession = event.data.object
      const referenceId = checkoutSession.client_reference_id
      if (!referenceId) { res.status(200).send('No referenceId'); return }

      const sep = referenceId.lastIndexOf('__')
      if (sep === -1) { res.status(400).send('Invalid referenceId'); return }

      const sessionId = referenceId.substring(0, sep)
      const clientId = referenceId.substring(sep + 2)
      const amountPaid = (checkoutSession.amount_total ?? 0) / 100

      const sessionRef = db.collection('sessions').doc(sessionId)
      const snap = await sessionRef.get()
      if (!snap.exists) { res.status(404).send('Session not found'); return }

      const sessionData = snap.data()!
      const distribution = (sessionData['paymentDistribution'] as Array<Record<string, unknown>>) ?? []

      const updated = distribution.map((p) =>
        p['clientId'] === clientId
          ? {
              ...p,
              paymentStatus: 'paid',
              amountPaid,
              paidAt: FieldValue.serverTimestamp(),
              stripeSessionId: checkoutSession.id,
            }
          : p
      )

      const allSettled = updated.every(
        (p) => p['paymentStatus'] === 'paid' || p['paymentStatus'] === 'offered'
      )

      await sessionRef.update({
        paymentDistribution: updated,
        paymentStatus: allSettled ? 'paid' : 'link_sent',
        updatedAt: FieldValue.serverTimestamp(),
      })

      res.status(200).send('OK')
    } catch (err) {
      console.error('stripeWebhook error:', err)
      res.status(500).send('Internal Server Error')
    }
  }
)
