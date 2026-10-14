import Stripe from 'stripe'
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiVersion = '2026-05-27.dahlia' as any

export function computePackExpiry(start: Date, value: number, unit: 'weeks' | 'months'): Date {
  const end = new Date(start)
  if (unit === 'weeks') end.setDate(end.getDate() + value * 7)
  else end.setMonth(end.getMonth() + value)
  return end
}

export async function createPackCheckout(opts: {
  clientPackId: string
  clientId: string
  title: string
  amountCHF: number
  clientEmail?: string
  baseUrl: string
}): Promise<{ url: string; id: string }> {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY manquant')

  const stripe = new Stripe(stripeKey, { apiVersion })
  const successUrl = new URL(process.env.STRIPE_SUCCESS_URL || `${opts.baseUrl}/paiement-confirme`)
  successUrl.searchParams.set('type', 'pack')
  const cancelUrl = process.env.STRIPE_RETURN_URL || 'https://bisrepetita.ch'

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    ...(opts.clientEmail ? { customer_email: opts.clientEmail } : {}),
    line_items: [{
      price_data: {
        currency: 'chf',
        product_data: { name: opts.title },
        unit_amount: Math.round(opts.amountCHF * 100),
      },
      quantity: 1,
    }],
    success_url: successUrl.toString(),
    cancel_url: cancelUrl,
    client_reference_id: `pack__${opts.clientPackId}__${opts.clientId}`,
  })

  if (!checkoutSession.url) throw new Error('Stripe: pas d\'URL retournée')
  return { url: checkoutSession.url, id: checkoutSession.id }
}

/**
 * Active un pack acheté en ligne à réception du paiement Stripe. Idempotent (webhook rejoué). La
 * validité court à partir du paiement effectif, pas de la création du checkout — un client qui
 * paie plusieurs jours après avoir ouvert le lien ne perd pas ces jours.
 */
export async function activatePackFromWebhookInTransaction(
  tx: Transaction, adminDb: Firestore,
  opts: { clientPackId: string; clientId: string; stripeSessionId: string; amountPaid: number }
): Promise<'activated' | 'already_active' | 'not_found'> {
  const packRef = adminDb.collection('clientPacks').doc(opts.clientPackId)
  const snap = await tx.get(packRef)
  if (!snap.exists || snap.data()?.['clientId'] !== opts.clientId) return 'not_found'

  const data = snap.data()!
  if (data['status'] === 'active' && data['stripeSessionId'] === opts.stripeSessionId) return 'already_active'

  const snapshot = data['packSnapshot'] as { validityValue: number; validityUnit: 'weeks' | 'months' }
  const now = new Date()
  tx.update(packRef, {
    status: 'active',
    paymentStatus: 'paid',
    amountPaid: opts.amountPaid,
    stripeSessionId: opts.stripeSessionId,
    purchasedAt: now,
    expiresAt: computePackExpiry(now, snapshot.validityValue, snapshot.validityUnit),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return 'activated'
}
