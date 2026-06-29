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

    const body = (await req.json()) as { sessionId?: string; saleId?: string; clientId: string }
    const { clientId, sessionId, saleId } = body
    if ((!sessionId && !saleId) || !clientId) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })

    const adminDb = getAdminDb()
    const collectionName = saleId ? 'sales' : 'sessions'
    const docId = (saleId ?? sessionId)!
    const docRef = adminDb.collection(collectionName).doc(docId)
    const [docSnap, userSnap] = await Promise.all([
      docRef.get(),
      adminDb.collection('users').doc(uid).get(),
    ])

    if (!docSnap.exists) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    const docData = docSnap.data()!
    const userRoles: string[] = (userSnap.data() as { roles?: string[] })?.roles ?? []
    const isAdmin = userRoles.includes('admin')
    const isAssignedCoach = (docData['coachIds'] as string[]).includes(uid)
    if (!isAdmin && !isAssignedCoach) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const distribution = (docData['paymentDistribution'] as Array<Record<string, unknown>>) ?? []
    const entry = distribution.find((p) => p['clientId'] === clientId)
    if (!entry) return NextResponse.json({ error: 'Client introuvable dans ce document' }, { status: 404 })

    const amountCHF = entry['amountDue'] as number
    const clientSnap = await adminDb.collection('clients').doc(clientId).get()
    const client = clientSnap.data() as { firstName: string; lastName: string; email?: string } | undefined
    const clientName = client ? `${client.firstName} ${client.lastName}` : clientId
    const successUrl = process.env.STRIPE_SUCCESS_URL ?? 'https://g.page/r/CWNO2cYqxHNDEAE/review'
    const cancelUrl = process.env.STRIPE_RETURN_URL ?? 'https://bisrepetita.ch'

    // Label produit : pour une séance on inclut la date, pour une vente non
    let productName: string
    if (saleId) {
      const serviceName = (docData['priceSnapshot'] as Record<string, unknown>)?.['serviceName'] as string ?? 'Service'
      productName = `${serviceName} — ${clientName}`
    } else {
      const startAt = (docData['startAt'] as { toDate: () => Date }).toDate()
      const dateStr = startAt.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
      productName = `Séance ${dateStr} — ${clientName}`
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(client?.email ? { customer_email: client.email } : {}),
      line_items: [{
        price_data: {
          currency: 'chf',
          product_data: { name: productName },
          unit_amount: Math.round(amountCHF * 100),
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: `${docId}__${clientId}`,
    })

    if (!checkoutSession.url) return NextResponse.json({ error: 'Stripe: pas d\'URL retournée' }, { status: 500 })

    const updated = distribution.map((p) =>
      p['clientId'] === clientId
        ? { ...p, paymentStatus: 'link_sent', twintLink: checkoutSession.url, stripeSessionId: checkoutSession.id }
        : p
    )
    await docRef.update({ paymentDistribution: updated, updatedAt: FieldValue.serverTimestamp() })

    return NextResponse.json({ link: checkoutSession.url })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[create-payment-link]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
