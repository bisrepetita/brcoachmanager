import Stripe from 'stripe'

export function createStripeClient(secretKey: string): Stripe {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(secretKey, { apiVersion: '2024-06-20' as any })
}

// Crée une Checkout Session Stripe (lien de paiement unique)
export async function createCheckoutSession(opts: {
  stripe: Stripe
  amountCHF: number
  purpose: string
  referenceId: string
  returnUrl: string
}): Promise<string> {
  const session = await opts.stripe.checkout.sessions.create({
    // TWINT + carte — activer TWINT dans Stripe Dashboard → Payment methods
    payment_method_types: ['twint', 'card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'chf',
          product_data: { name: opts.purpose },
          unit_amount: Math.round(opts.amountCHF * 100), // en centimes
        },
        quantity: 1,
      },
    ],
    success_url: opts.returnUrl,
    cancel_url: opts.returnUrl,
    client_reference_id: opts.referenceId,
    // Lien valable 7 jours
    expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  })

  if (!session.url) throw new Error('Stripe: pas d\'URL de checkout retournée')
  return session.url
}
