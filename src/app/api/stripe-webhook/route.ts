import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import Stripe from 'stripe'
import { getAdminDb } from '@/lib/firebase/admin'
import { activateSubscriptionFromWebhookInTransaction } from '@/lib/server/subscription-admin'
import { notifyGroupSessionBooking, notifySubscriptionPurchase } from '@/lib/server/booking-notifications'
import { enrollmentsUpdate } from '@/lib/server/group-session-enrollments'

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

    const adminDb = getAdminDb()

    if (referenceId.startsWith('groupSession__')) {
      const [, groupSessionId, clientId] = referenceId.split('__')
      if (!groupSessionId || !clientId) return NextResponse.json({ error: 'Invalid referenceId' }, { status: 400 })

      const amountPaid = (checkoutSession.amount_total ?? 0) / 100
      const groupSessionRef = adminDb.collection('groupSessions').doc(groupSessionId)

      // Une seule inscription est concernée : celle liée à CE paiement Stripe (stripeSessionId),
      // à défaut l'inscription en attente de paiement du client. Avant, toutes les inscriptions du
      // client sur la séance étaient confirmées — y compris une inscription annulée, qui se
      // retrouvait réactivée (désinscription puis réinscription, ou paiement d'un ancien lien).
      const outcome = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(groupSessionRef)
        if (!snap.exists) return 'not_found' as const
        const data = snap.data()!
        const enrollments = (data['enrollments'] as Record<string, unknown>[] | undefined) ?? []
        const mine = (e: Record<string, unknown>) => e['clientId'] === clientId
        let idx = enrollments.findIndex((e) => e['stripeSessionId'] === checkoutSession.id)
        if (idx === -1) idx = enrollments.findIndex((e) => mine(e) && e['status'] === 'pending_payment')
        if (idx === -1) idx = enrollments.findIndex((e) => mine(e) && e['status'] !== 'cancelled')
        if (idx === -1) idx = enrollments.findLastIndex((e) => mine(e))
        if (idx === -1) return 'not_found' as const

        const entry = enrollments[idx]!
        // Événement Stripe rejoué (webhook renvoyé) : déjà traité, rien à refaire ni à renvoyer.
        if (entry['paymentStatus'] === 'paid' && entry['stripeSessionId'] === checkoutSession.id) return 'already_paid' as const

        const isCancelled = entry['status'] === 'cancelled'
        const updated = [...enrollments]
        updated[idx] = {
          ...entry,
          // Inscription annulée entre-temps : on enregistre le paiement reçu sans la réactiver
          // (la place a pu être reprise) — à rembourser ou réinscrire à la main.
          status: isCancelled ? 'cancelled' : 'confirmed',
          paymentStatus: 'paid', amountPaid, paidAt: new Date(), stripeSessionId: checkoutSession.id,
        }
        tx.update(groupSessionRef, { ...enrollmentsUpdate(updated), updatedAt: FieldValue.serverTimestamp() })
        return isCancelled ? 'paid_after_cancel' as const : 'confirmed' as const
      })

      if (outcome === 'paid_after_cancel') {
        await adminDb.collection('activityLogs').add({
          userId: 'stripe-webhook', userFirstName: 'Stripe', userLastName: '',
          action: 'group_session_cancelled_after_payment',
          description: `Paiement Stripe de ${amountPaid.toFixed(2)} CHF reçu pour une inscription déjà annulée — à rembourser ou réinscrire manuellement`,
          sessionId: groupSessionId, clientId,
          createdAt: FieldValue.serverTimestamp(),
        })
      }

      // Confirmation client best-effort (le coach a déjà été notifié à l'inscription) — le
      // paiement vient d'arriver, la réservation n'était encore que 'pending_payment'.
      if (outcome === 'confirmed') {
        await notifyGroupSessionBooking(adminDb, {
          groupSessionId, clientId,
          notifyCoaches: false, notifyClient: true,
          amountPaid, paymentLabel: 'Payé',
          baseUrl: req.nextUrl.origin,
        })
      }

      return NextResponse.json({ received: true })
    }

    if (referenceId.startsWith('subscription__')) {
      const [, clientSubscriptionId, clientId] = referenceId.split('__')
      if (!clientSubscriptionId || !clientId) return NextResponse.json({ error: 'Invalid referenceId' }, { status: 400 })

      const amountPaid = (checkoutSession.amount_total ?? 0) / 100
      const result = await adminDb.runTransaction((tx) =>
        activateSubscriptionFromWebhookInTransaction(tx, adminDb, {
          clientSubscriptionId, clientId, stripeSessionId: checkoutSession.id, amountPaid,
        })
      )

      if (result === 'activated') {
        const subSnap = await adminDb.collection('clientSubscriptions').doc(clientSubscriptionId).get()
        const planSnapshot = subSnap.data()?.['planSnapshot'] as { name: string; price: number } | undefined
        const endAt = subSnap.data()?.['endAt']
        if (planSnapshot && endAt) {
          await notifySubscriptionPurchase(adminDb, {
            clientId, planName: planSnapshot.name, price: planSnapshot.price, endAt,
          })
        }
      }

      return NextResponse.json({ received: true })
    }

    const sep = referenceId.lastIndexOf('__')
    if (sep === -1) return NextResponse.json({ error: 'Invalid referenceId' }, { status: 400 })

    const docId = referenceId.substring(0, sep)
    const clientId = referenceId.substring(sep + 2)
    const amountPaid = (checkoutSession.amount_total ?? 0) / 100

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
