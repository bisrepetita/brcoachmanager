import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import Stripe from 'stripe'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) return NextResponse.json({ error: 'STRIPE_SECRET_KEY manquant' }, { status: 500 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-05-27.dahlia' as any })

    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const adminAuth = getAdminAuth()
    const decoded = await adminAuth.verifyIdToken(token)
    const uid = decoded.uid

    const { sessionId, clientId } = (await req.json()) as { sessionId: string; clientId: string }
    if (!sessionId || !clientId) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })

    const adminDb = getAdminDb()
    const sessionRef = adminDb.collection('sessions').doc(sessionId)
    const [sessionSnap, userSnap] = await Promise.all([
      sessionRef.get(),
      adminDb.collection('users').doc(uid).get(),
    ])

    if (!sessionSnap.exists) return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 })

    const session = sessionSnap.data()!
    const userRoles: string[] = (userSnap.data() as { roles?: string[] })?.roles ?? []
    const isAdmin = userRoles.includes('admin')
    const isAssignedCoach = (session['coachIds'] as string[]).includes(uid)
    if (!isAdmin && !isAssignedCoach) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const distribution = (session['paymentDistribution'] as Array<Record<string, unknown>>) ?? []
    const entry = distribution.find((p) => p['clientId'] === clientId)
    if (!entry) return NextResponse.json({ error: 'Client introuvable dans cette séance' }, { status: 404 })

    const amountCHF = entry['amountDue'] as number
    const clientSnap = await adminDb.collection('clients').doc(clientId).get()
    const client = clientSnap.data() as { firstName: string; lastName: string; email?: string } | undefined
    const clientName = client ? `${client.firstName} ${client.lastName}` : clientId
    const startAt = (session['startAt'] as { toDate: () => Date }).toDate()
    const dateStr = startAt.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
    const returnUrl = process.env.STRIPE_RETURN_URL ?? 'https://bisrepetita.ch'

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      ...(client?.email ? { customer_email: client.email } : {}),
      line_items: [{
        price_data: {
          currency: 'chf',
          product_data: { name: `Séance ${dateStr} — ${clientName}` },
          unit_amount: Math.round(amountCHF * 100),
        },
        quantity: 1,
      }],
      success_url: returnUrl,
      cancel_url: returnUrl,
      client_reference_id: `${sessionId}__${clientId}`,
    })

    if (!checkoutSession.url) return NextResponse.json({ error: 'Stripe: pas d\'URL retournée' }, { status: 500 })

    const updated = distribution.map((p) =>
      p['clientId'] === clientId
        ? { ...p, paymentStatus: 'link_sent', twintLink: checkoutSession.url, stripeSessionId: checkoutSession.id }
        : p
    )
    await sessionRef.update({ paymentDistribution: updated, updatedAt: FieldValue.serverTimestamp() })

    return NextResponse.json({ link: checkoutSession.url })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[create-payment-link]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
