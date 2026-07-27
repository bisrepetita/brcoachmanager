import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { createGroupSessionCheckout } from '@/lib/server/group-session-stripe'
import {
  resolveDiscountInTransaction, applyDiscountInTransaction,
  computeDiscountedAmount, discountLabelAdmin,
} from '@/lib/server/discount-admin'
import {
  findActiveSubscriptionInTransaction, matchesCoverage,
  countWeeklyConsumptionsInTransaction, recordConsumptionInTransaction,
} from '@/lib/server/subscription-admin'
import { notifyGroupSessionBooking } from '@/lib/server/booking-notifications'

// Type "loose" côté serveur : le type partagé GroupSessionEnrollment (src/types) pointe sur le
// Timestamp du SDK client, incompatible avec firebase-admin/firestore côté API route.
type ServerEnrollment = Record<string, unknown> & { clientId: string; status: string }

function paymentLabelFor(paymentStatus: string): string {
  switch (paymentStatus) {
    case 'credits': return 'Abonnement'
    case 'offered': return 'Offert'
    case 'paid': return 'Payé'
    case 'payment_to_request':
    case 'link_sent': return 'Paiement en attente'
    default: return paymentStatus
  }
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

  const { groupSessionId, promoCode } = (await req.json()) as { groupSessionId?: string; promoCode?: string }
  if (!groupSessionId) return NextResponse.json({ error: 'groupSessionId requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()

    const clientRef = adminDb.collection('clients').where('uid', '==', uid).limit(1)
    const clientSnap = await clientRef.get()
    if (clientSnap.empty) {
      return NextResponse.json({ error: 'Compte non lié à une fiche client' }, { status: 412 })
    }
    const clientId = clientSnap.docs[0]!.id
    const clientDocRef = clientSnap.docs[0]!.ref

    const groupSessionRef = adminDb.collection('groupSessions').doc(groupSessionId)

    const enrollment = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(groupSessionRef)
      if (!snap.exists) throw new HttpError(404, 'Séance introuvable')

      const data = snap.data()!
      if (data['status'] !== 'planned' || data['isPublic'] !== true) {
        throw new HttpError(412, 'Séance non disponible')
      }
      const startAt = (data['startAt'] as Timestamp).toDate()
      if (startAt.getTime() <= Date.now()) {
        throw new HttpError(412, 'Séance déjà passée')
      }

      const enrollments = (data['enrollments'] as ServerEnrollment[] | undefined) ?? []
      const active = enrollments.filter((e) => e.status !== 'cancelled')

      if (active.some((e) => e.clientId === clientId)) {
        throw new HttpError(409, 'Déjà inscrit à cette séance')
      }
      if (active.length >= (data['maxParticipants'] as number)) {
        throw new HttpError(409, 'Séance complète')
      }

      const clientTxSnap = await tx.get(clientDocRef)
      const hasEverBooked = clientTxSnap.data()?.['hasEverBooked'] === true
      const serviceId = data['serviceId'] as string | undefined

      // Couverture abonnement : vérifiée avant tout (revenu déjà encaissé à l'achat de
      // l'abonnement) — si couverte, on ne regarde même pas la gratuité "1ère réservation" ni
      // les remises, pas de cumul.
      const activeSub = await findActiveSubscriptionInTransaction(tx, adminDb, clientId)
      let subscriptionRef: DocumentReference | null = null
      if (activeSub && matchesCoverage(activeSub.data.planSnapshot, {
        serviceId, dayOfWeek: data['dayOfWeek'] as number | undefined, startTime: data['startTime'] as string | undefined,
      })) {
        const usedThisWeek = await countWeeklyConsumptionsInTransaction(tx, activeSub.ref, startAt)
        if (usedThisWeek < activeSub.data.planSnapshot.sessionsPerWeek) {
          subscriptionRef = activeSub.ref
        }
      }

      // Remise : rabais client auto-détecté, ou code promo fourni (pas de cumul des deux, ni avec
      // un abonnement qui couvre déjà la séance).
      let service: { id: string; isPublic?: boolean } | null = null
      let serviceFirstBookingFree = false
      if (!subscriptionRef && serviceId) {
        const serviceSnap = await tx.get(adminDb.collection('services').doc(serviceId))
        if (serviceSnap.exists) {
          service = { id: serviceSnap.id, isPublic: serviceSnap.data()!['isPublic'] as boolean | undefined }
          serviceFirstBookingFree = serviceSnap.data()!['firstBookingFree'] === true
        }
      }

      const basePrice = data['price'] as number
      const firstBookingFree = !subscriptionRef && serviceFirstBookingFree && !hasEverBooked

      const discountResult = (subscriptionRef || firstBookingFree)
        ? null
        : await resolveDiscountInTransaction(tx, adminDb, { clientId, promoCode, service })
      if (discountResult && 'error' in discountResult) {
        throw new HttpError(400, discountResult.error)
      }

      const newEnrollment: ServerEnrollment = subscriptionRef
        ? {
            clientId,
            status: 'confirmed',
            amountDue: 0,
            amountPaid: 0,
            paymentStatus: 'credits',
            enrolledAt: Timestamp.now(),
            subscriptionId: subscriptionRef.id,
          }
        : firstBookingFree
          ? {
              clientId,
              status: 'confirmed',
              amountDue: 0,
              amountPaid: 0,
              paymentStatus: 'offered',
              enrolledAt: Timestamp.now(),
              originalAmountDue: basePrice,
              discountLabel: 'Première réservation offerte',
            }
          : discountResult
            ? {
                clientId,
                status: 'pending_payment',
                amountDue: computeDiscountedAmount(basePrice, discountResult.data),
                amountPaid: 0,
                paymentStatus: 'payment_to_request',
                enrolledAt: Timestamp.now(),
                discountId: discountResult.ref.id,
                discountLabel: discountLabelAdmin(discountResult.data),
                originalAmountDue: basePrice,
              }
            : {
                clientId,
                status: 'pending_payment',
                amountDue: basePrice,
                amountPaid: 0,
                paymentStatus: 'payment_to_request',
                enrolledAt: Timestamp.now(),
              }

      tx.update(groupSessionRef, {
        enrollments: [...enrollments, newEnrollment],
        updatedAt: FieldValue.serverTimestamp(),
      })

      if (!hasEverBooked) {
        tx.update(clientDocRef, { hasEverBooked: true, updatedAt: FieldValue.serverTimestamp() })
      }

      if (subscriptionRef) {
        recordConsumptionInTransaction(tx, subscriptionRef, { clientId, uid, groupSessionId, sessionStartAt: startAt })
      }

      if (discountResult) {
        applyDiscountInTransaction(tx, discountResult.ref, {
          clientId, context: 'group_session', refId: groupSessionId,
          amountBefore: basePrice, amountAfter: newEnrollment.amountDue as number,
        })
      }

      return newEnrollment
    })

    // Notifications email best-effort (jamais bloquantes) : le coach est informé dès
    // l'inscription quel que soit le statut de paiement ; le client n'est notifié tout de suite
    // que si la réservation est déjà définitivement confirmée (gratuite/abonnement) — sinon la
    // confirmation client partira du webhook Stripe une fois le paiement reçu.
    const isImmediatelyConfirmed = enrollment.amountDue === 0
    await notifyGroupSessionBooking(adminDb, {
      groupSessionId, clientId,
      notifyCoaches: true,
      notifyClient: isImmediatelyConfirmed,
      amountPaid: (enrollment.amountPaid as number) ?? 0,
      paymentLabel: paymentLabelFor(enrollment.paymentStatus as string),
    })

    // Séance offerte (1ère réservation) : déjà confirmée dans la transaction, pas de paiement à
    // générer — on court-circuite Stripe entièrement.
    if (isImmediatelyConfirmed) {
      return NextResponse.json({ enrollment })
    }

    // Place réservée : on génère le lien de paiement hors transaction (appel réseau externe).
    // Si cette étape échoue, la place reste réservée en 'pending_payment' sans lien — le client
    // peut relancer via /api/group-sessions/request-payment-link.
    const groupSessionSnap = await groupSessionRef.get()
    const groupSessionData = groupSessionSnap.data()!
    const clientDoc = clientSnap.docs[0]!.data()

    const checkout = await createGroupSessionCheckout({
      groupSessionId,
      clientId,
      title: `${groupSessionData['title']} — ${clientDoc['firstName']} ${clientDoc['lastName']}`,
      amountCHF: enrollment.amountDue as number,
      clientEmail: clientDoc['email'] as string | undefined,
      baseUrl: req.nextUrl.origin,
    })

    const enrollments = (groupSessionData['enrollments'] as Record<string, unknown>[])
    const updatedEnrollments = enrollments.map((e) =>
      e['clientId'] === clientId && e['status'] === 'pending_payment'
        ? { ...e, stripeCheckoutUrl: checkout.url, stripeSessionId: checkout.id, paymentStatus: 'link_sent' }
        : e
    )
    await groupSessionRef.update({ enrollments: updatedEnrollments, updatedAt: FieldValue.serverTimestamp() })

    return NextResponse.json({ enrollment, checkoutUrl: checkout.url })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[group-sessions/enroll]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
