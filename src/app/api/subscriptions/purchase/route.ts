import { NextRequest, NextResponse } from 'next/server'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { createSubscriptionCheckout } from '@/lib/server/subscription-stripe'

function computeEndDate(start: Date, value: number, unit: 'weeks' | 'months'): Date {
  const end = new Date(start)
  if (unit === 'weeks') end.setDate(end.getDate() + value * 7)
  else end.setMonth(end.getMonth() + value)
  return end
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { planId } = (await req.json()) as { planId?: string }
  if (!planId) return NextResponse.json({ error: 'planId requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()

    const clientSnap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
    if (clientSnap.empty) {
      return NextResponse.json({ error: 'Compte non lié à une fiche client' }, { status: 412 })
    }
    const clientDoc = clientSnap.docs[0]!
    const clientId = clientDoc.id

    const planSnap = await adminDb.collection('subscriptionPlans').doc(planId).get()
    if (!planSnap.exists) return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 })
    const plan = planSnap.data()!
    if (plan['isPublic'] !== true || plan['active'] !== true) {
      return NextResponse.json({ error: 'Cet abonnement n\'est pas disponible à l\'achat.' }, { status: 412 })
    }

    // Pré-vérification (UX, pas la garantie réelle — l'invariant "un seul abonnement actif" est
    // revalidé atomiquement au moment de l'activation par le webhook, cf. subscription-admin.ts).
    const activeId = clientDoc.data()['activeSubscriptionId'] as string | undefined
    if (activeId) {
      const activeSnap = await adminDb.collection('clientSubscriptions').doc(activeId).get()
      const activeData = activeSnap.data()
      if (activeSnap.exists && activeData?.['status'] === 'active' && (activeData['endAt'] as Timestamp).toDate() >= new Date()) {
        return NextResponse.json({ error: 'Tu as déjà un abonnement actif.' }, { status: 412 })
      }
    }

    const now = new Date()
    const endAt = computeEndDate(now, plan['durationValue'] as number, plan['durationUnit'] as 'weeks' | 'months')
    const subRef = adminDb.collection('clientSubscriptions').doc()

    await subRef.set({
      clientId,
      uid,
      planId,
      planSnapshot: {
        name: plan['name'],
        serviceIds: plan['serviceIds'],
        sessionsPerWeek: plan['sessionsPerWeek'],
        ...(plan['fixedSlot'] ? { fixedSlot: plan['fixedSlot'] } : {}),
        durationValue: plan['durationValue'],
        durationUnit: plan['durationUnit'],
        price: plan['price'],
      },
      startAt: Timestamp.fromDate(now),
      endAt: Timestamp.fromDate(endAt),
      status: 'pending_payment',
      paymentStatus: 'link_sent',
      amountDue: plan['price'],
      amountPaid: 0,
      source: 'self_purchase',
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const checkout = await createSubscriptionCheckout({
      clientSubscriptionId: subRef.id,
      clientId,
      title: `Abonnement — ${plan['name']}`,
      amountCHF: plan['price'] as number,
      clientEmail: clientDoc.data()['email'] as string | undefined,
      baseUrl: req.nextUrl.origin,
    })

    await subRef.update({
      stripeCheckoutUrl: checkout.url,
      stripeSessionId: checkout.id,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ checkoutUrl: checkout.url })
  } catch (err) {
    console.error('[subscriptions/purchase]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
