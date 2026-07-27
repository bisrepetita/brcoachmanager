import Stripe from 'stripe'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiVersion = '2026-05-27.dahlia' as any

export async function createSubscriptionCheckout(opts: {
  clientSubscriptionId: string
  clientId: string
  title: string
  amountCHF: number
  clientEmail?: string
  baseUrl: string
}): Promise<{ url: string; id: string }> {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY manquant')

  const stripe = new Stripe(stripeKey, { apiVersion })
  const successUrl = process.env.STRIPE_SUCCESS_URL || `${opts.baseUrl}/paiement-confirme`
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
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: `subscription__${opts.clientSubscriptionId}__${opts.clientId}`,
  })

  if (!checkoutSession.url) throw new Error('Stripe: pas d\'URL retournée')
  return { url: checkoutSession.url, id: checkoutSession.id }
}
