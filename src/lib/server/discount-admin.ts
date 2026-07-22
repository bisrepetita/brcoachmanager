import { FieldValue, type Transaction, type Firestore, type DocumentReference, type DocumentData } from 'firebase-admin/firestore'

type DiscountData = DocumentData & {
  kind: 'code' | 'client'
  discountType: 'percentage' | 'fixed_amount'
  value: number
  scope: { serviceIds: string[]; allPublicServices: boolean }
  startAt?: FirebaseFirestore.Timestamp
  endAt?: FirebaseFirestore.Timestamp
  maxUsesGlobal?: number
  maxUsesPerClient?: number
  usesCount: number
  active: boolean
  code?: string
  note?: string
}

export function computeDiscountedAmount(base: number, discount: { discountType: 'percentage' | 'fixed_amount'; value: number }): number {
  const raw = discount.discountType === 'percentage'
    ? base * (1 - discount.value / 100)
    : base - discount.value
  return Math.max(0, Math.round(raw * 100) / 100)
}

export function matchesScope(scope: DiscountData['scope'], service: { id: string; isPublic?: boolean }): boolean {
  if (scope.allPublicServices) return service.isPublic === true
  return scope.serviceIds.length === 0 || scope.serviceIds.includes(service.id)
}

export function discountLabelAdmin(discount: { kind: string; code?: string; note?: string }): string {
  return discount.kind === 'code' ? (discount.code ?? '') : (discount.note?.trim() || 'Remise fidélité')
}

function isWithinWindow(d: Pick<DiscountData, 'startAt' | 'endAt'>, now: Date): boolean {
  if (d.startAt && d.startAt.toDate() > now) return false
  if (d.endAt && d.endAt.toDate() < now) return false
  return true
}

/**
 * À appeler pendant la phase de LECTURE de la transaction (avant tout tx.update/tx.set) :
 * résout le rabais client auto-détecté ou le code promo fourni, et vérifie ses limites d'usage.
 * Retourne null si aucun rabais applicable (pas une erreur — l'inscription continue au prix plein).
 */
export async function resolveDiscountInTransaction(
  tx: Transaction,
  adminDb: Firestore,
  opts: { clientId: string; promoCode?: string; service: { id: string; isPublic?: boolean } | null }
): Promise<{ ref: DocumentReference; data: DiscountData; kind: string } | { error: string } | null> {
  if (!opts.service) return null

  // Le rabais client auto-attribué prime toujours sur un code promo saisi (pas de cumul,
  // décision produit) — on ne regarde le code que si le client n'a pas de rabais actif.
  const clientQ = adminDb.collection('discounts')
    .where('kind', '==', 'client')
    .where('clientId', '==', opts.clientId)
    .where('active', '==', true)
  const clientSnap = await tx.get(clientQ)
  const now = new Date()
  const clientCandidate = clientSnap.docs.find(d => {
    const data = d.data() as DiscountData
    return matchesScope(data.scope, opts.service!) && isWithinWindow(data, now)
  })

  let candidateSnap: FirebaseFirestore.QueryDocumentSnapshot | undefined = clientCandidate
  const usingPromoCode = !clientCandidate && !!opts.promoCode

  if (usingPromoCode) {
    const q = adminDb.collection('discounts')
      .where('kind', '==', 'code')
      .where('code', '==', opts.promoCode!.trim().toUpperCase())
    const snap = await tx.get(q)
    candidateSnap = snap.docs[0]
    if (!candidateSnap) return { error: 'Code promo invalide.' }
  }

  if (!candidateSnap) return null
  const data = candidateSnap.data() as DiscountData

  if (usingPromoCode) {
    if (!matchesScope(data.scope, opts.service)) return { error: 'Ce code n\'est pas valable pour cette séance.' }
    if (!data.active) return { error: 'Ce code promo n\'est plus actif.' }
    if (!isWithinWindow(data, now)) return { error: 'Ce code promo n\'est plus valable à cette date.' }
  }

  if (data.maxUsesGlobal !== undefined && data.usesCount >= data.maxUsesGlobal) {
    return usingPromoCode ? { error: 'Ce code promo a atteint son nombre maximum d\'utilisations.' } : null
  }
  if (data.maxUsesPerClient !== undefined) {
    const redemptionsSnap = await tx.get(
      candidateSnap.ref.collection('redemptions').where('clientId', '==', opts.clientId)
    )
    if (redemptionsSnap.size >= data.maxUsesPerClient) {
      return usingPromoCode ? { error: 'Tu as déjà utilisé ce code le nombre maximum de fois autorisé.' } : null
    }
  }

  return { ref: candidateSnap.ref, data, kind: data.kind }
}

/** À appeler pendant la phase d'ÉCRITURE de la transaction, après resolveDiscountInTransaction. */
export function applyDiscountInTransaction(
  tx: Transaction,
  discountRef: DocumentReference,
  opts: { clientId: string; context: 'group_session'; refId: string; amountBefore: number; amountAfter: number }
): void {
  tx.update(discountRef, { usesCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() })
  const redemptionRef = discountRef.collection('redemptions').doc()
  tx.set(redemptionRef, {
    clientId: opts.clientId,
    context: opts.context,
    refId: opts.refId,
    amountBefore: opts.amountBefore,
    amountAfter: opts.amountAfter,
    createdAt: FieldValue.serverTimestamp(),
  })
}
