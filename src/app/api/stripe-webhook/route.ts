import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import Stripe from 'stripe'
import { getAdminDb } from '@/lib/firebase/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[stripe-webhook] signature error:', err)
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  try {
    const checkoutSession = event.data.object as Stripe.Checkout.Session
    const referenceId = checkoutSession.client_reference_id
    if (!referenceId) return NextResponse.json({ received: true })

    const sep = referenceId.lastIndexOf('__')
    if (sep === -1) return NextResponse.json({ error: 'Invalid referenceId' }, { status: 400 })

    const docId = referenceId.substring(0, sep)
    const clientId = referenceId.substring(sep + 2)
    const amountPaid = (checkoutSession.amount_total ?? 0) / 100

    const adminDb = getAdminDb()

    // Résoudre la collection : sessions en priorité, puis sales
    let docRef = adminDb.collection('sessions').doc(docId)
    let snap = await docRef.get()
    let collectionName = 'sessions'
    if (!snap.exists) {
      docRef = adminDb.collection('sales').doc(docId)
      snap = await docRef.get()
      collectionName = 'sales'
    }
    if (!snap.exists) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const docData = snap.data()!
    const distribution = (docData['paymentDistribution'] as Array<Record<string, unknown>>) ?? []

    const updated = distribution.map((p) =>
      p['clientId'] === clientId
        ? { ...p, paymentStatus: 'paid', amountPaid, paidAt: new Date(), stripeSessionId: checkoutSession.id }
        : p
    )

    const allSettled = updated.every(
      (p) => p['paymentStatus'] === 'paid' || p['paymentStatus'] === 'offered' || p['paymentStatus'] === 'cancelled'
    )

    await docRef.update({
      paymentDistribution: updated,
      paymentStatus: allSettled ? 'paid' : 'link_sent',
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Notifier les admins du paiement reçu
    const navLink = collectionName === 'sales' ? `/sales/${docId}` : `/sessions/${docId}`
    try {
      const adminsSnap = await adminDb.collection('users')
        .where('roles', 'array-contains', 'admin')
        .get()
      const adminTokens = adminsSnap.docs
        .map(d => d.data()['fcmToken'] as string | undefined)
        .filter((t): t is string => !!t)

      if (adminTokens.length > 0) {
        const { getMessaging } = await import('firebase-admin/messaging')
        const { getAdminApp } = await import('@/lib/firebase/admin')
        await getMessaging(getAdminApp()).sendEachForMulticast({
          tokens: adminTokens,
          notification: {
            title: 'Paiement reçu',
            body: `${amountPaid.toFixed(2)} CHF`,
          },
          data: { link: navLink },
          webpush: { fcmOptions: { link: navLink } },
        })
      }
    } catch {
      // Notifications non critiques
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[stripe-webhook] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
