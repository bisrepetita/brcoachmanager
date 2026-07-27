import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { createGroupSessionCheckout } from '@/lib/server/group-session-stripe'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { groupSessionId } = (await req.json()) as { groupSessionId?: string }
  if (!groupSessionId) return NextResponse.json({ error: 'groupSessionId requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()

    const clientSnap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
    if (clientSnap.empty) return NextResponse.json({ error: 'Compte non lié à une fiche client' }, { status: 412 })
    const clientId = clientSnap.docs[0]!.id
    const clientDoc = clientSnap.docs[0]!.data()

    const groupSessionRef = adminDb.collection('groupSessions').doc(groupSessionId)
    const snap = await groupSessionRef.get()
    if (!snap.exists) return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 })

    const data = snap.data()!
    const enrollments = (data['enrollments'] as Record<string, unknown>[] | undefined) ?? []
    const entry = enrollments.find((e) => e['clientId'] === clientId && e['status'] === 'pending_payment')
    if (!entry) return NextResponse.json({ error: 'Aucune inscription en attente de paiement' }, { status: 404 })

    const checkout = await createGroupSessionCheckout({
      groupSessionId,
      clientId,
      title: `${data['title']} — ${clientDoc['firstName']} ${clientDoc['lastName']}`,
      amountCHF: entry['amountDue'] as number,
      clientEmail: clientDoc['email'] as string | undefined,
      baseUrl: req.nextUrl.origin,
    })

    const updated = enrollments.map((e) =>
      e['clientId'] === clientId && e['status'] === 'pending_payment'
        ? { ...e, stripeCheckoutUrl: checkout.url, stripeSessionId: checkout.id, paymentStatus: 'link_sent' }
        : e
    )
    await groupSessionRef.update({ enrollments: updated, updatedAt: FieldValue.serverTimestamp() })

    return NextResponse.json({ checkoutUrl: checkout.url })
  } catch (err) {
    console.error('[group-sessions/request-payment-link]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
