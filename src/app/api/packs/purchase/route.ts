import { NextRequest, NextResponse } from 'next/server'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { isLimitedOfferExpired, type LimitedOfferFields } from '@/lib/utils/limited-offer'
import { computePackExpiry, createPackCheckout } from '@/lib/server/pack-admin'

// Achat d'un pack en self-service : crée le pack client en 'pending_payment' puis renvoie l'URL
// du checkout Stripe. Les crédits ne deviennent utilisables qu'à l'activation par le webhook.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { packPlanId } = (await req.json()) as { packPlanId?: string }
  if (!packPlanId) return NextResponse.json({ error: 'packPlanId requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()

    const clientSnap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
    if (clientSnap.empty) {
      return NextResponse.json({ error: 'Compte non lié à une fiche client' }, { status: 412 })
    }
    const clientDoc = clientSnap.docs[0]!
    const clientId = clientDoc.id

    const planSnap = await adminDb.collection('packPlans').doc(packPlanId).get()
    if (!planSnap.exists) return NextResponse.json({ error: 'Pack introuvable' }, { status: 404 })
    const plan = planSnap.data()!
    if (plan['isPublic'] !== true || plan['active'] !== true) {
      return NextResponse.json({ error: 'Ce pack n\'est pas disponible à l\'achat.' }, { status: 412 })
    }
    if (isLimitedOfferExpired(plan as LimitedOfferFields)) {
      return NextResponse.json({ error: 'Cette offre est terminée.' }, { status: 412 })
    }

    // Dates provisoires — recalculées à partir du paiement effectif par le webhook.
    const now = new Date()
    const expiresAt = computePackExpiry(now, plan['validityValue'] as number, plan['validityUnit'] as 'weeks' | 'months')
    const packRef = adminDb.collection('clientPacks').doc()

    await packRef.set({
      clientId,
      uid,
      packPlanId,
      packSnapshot: {
        name: plan['name'],
        sessionCount: plan['sessionCount'],
        price: plan['price'],
        validityValue: plan['validityValue'],
        validityUnit: plan['validityUnit'],
        serviceIds: plan['serviceIds'],
      },
      creditsTotal: plan['sessionCount'],
      creditsRemaining: plan['sessionCount'],
      purchasedAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromDate(expiresAt),
      status: 'pending_payment',
      paymentStatus: 'link_sent',
      amountDue: plan['price'],
      amountPaid: 0,
      source: 'self_purchase',
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const checkout = await createPackCheckout({
      clientPackId: packRef.id,
      clientId,
      title: `Pack — ${plan['name']}`,
      amountCHF: plan['price'] as number,
      clientEmail: clientDoc.data()['email'] as string | undefined,
      baseUrl: req.nextUrl.origin,
    })

    await packRef.update({
      stripeCheckoutUrl: checkout.url,
      stripeSessionId: checkout.id,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ checkoutUrl: checkout.url })
  } catch (err) {
    console.error('[packs/purchase]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
