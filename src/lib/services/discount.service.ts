import {
  collection, doc, query, where, getDocs, getCountFromServer,
  runTransaction, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { Discount, DiscountScope, DiscountValueType, Service } from '@/types'

export function computeDiscountedAmount(base: number, discount: { discountType: DiscountValueType; value: number }): number {
  const raw = discount.discountType === 'percentage'
    ? base * (1 - discount.value / 100)
    : base - discount.value
  return Math.max(0, Math.round(raw * 100) / 100)
}

export function matchesScope(scope: DiscountScope, service: Pick<Service, 'id' | 'isPublic'>): boolean {
  if (scope.allPublicServices) return service.isPublic === true
  return scope.serviceIds.length === 0 || scope.serviceIds.includes(service.id)
}

function isWithinWindow(discount: Pick<Discount, 'startAt' | 'endAt'>, now: Date): boolean {
  if (discount.startAt && discount.startAt.toDate() > now) return false
  if (discount.endAt && discount.endAt.toDate() < now) return false
  return true
}

export async function findActiveClientDiscount(clientId: string, service: Pick<Service, 'id' | 'isPublic'>): Promise<Discount | null> {
  const snap = await getDocs(query(
    collection(db, 'discounts'),
    where('kind', '==', 'client'),
    where('clientId', '==', clientId),
    where('active', '==', true),
  ))
  const now = new Date()
  const candidates = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Discount))
    .filter(d => matchesScope(d.scope, service) && isWithinWindow(d, now))
  return candidates[0] ?? null
}

export async function lookupPromoCode(code: string): Promise<Discount | null> {
  const snap = await getDocs(query(
    collection(db, 'discounts'),
    where('kind', '==', 'code'),
    where('code', '==', code.trim().toUpperCase()),
  ))
  const d = snap.docs[0]
  return d ? ({ id: d.id, ...d.data() } as Discount) : null
}

export async function checkUsageLimits(discount: Discount, clientId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date()
  if (!discount.active) return { ok: false, error: 'Cette remise n\'est plus active.' }
  if (!isWithinWindow(discount, now)) return { ok: false, error: 'Cette remise n\'est plus valable à cette date.' }
  if (discount.maxUsesGlobal !== undefined && discount.usesCount >= discount.maxUsesGlobal) {
    return { ok: false, error: 'Cette remise a atteint son nombre maximum d\'utilisations.' }
  }
  if (discount.maxUsesPerClient !== undefined) {
    const countSnap = await getCountFromServer(
      query(collection(db, 'discounts', discount.id, 'redemptions'), where('clientId', '==', clientId))
    )
    if (countSnap.data().count >= discount.maxUsesPerClient) {
      return { ok: false, error: 'Tu as déjà utilisé cette remise le nombre maximum de fois autorisé.' }
    }
  }
  return { ok: true }
}

export async function recordRedemption(opts: {
  discountId: string
  clientId: string
  context: 'session' | 'sale' | 'group_session'
  refId: string
  amountBefore: number
  amountAfter: number
}): Promise<void> {
  const discountRef = doc(db, 'discounts', opts.discountId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(discountRef)
    if (!snap.exists()) return
    tx.update(discountRef, {
      usesCount: (snap.data().usesCount as number ?? 0) + 1,
      updatedAt: serverTimestamp(),
    })
  })
  await addDoc(collection(db, 'discounts', opts.discountId, 'redemptions'), {
    clientId: opts.clientId,
    context: opts.context,
    refId: opts.refId,
    amountBefore: opts.amountBefore,
    amountAfter: opts.amountAfter,
    createdAt: serverTimestamp(),
  })
}

export function discountLabel(discount: Discount): string {
  return discount.kind === 'code' ? (discount.code ?? '') : (discount.note?.trim() || 'Remise fidélité')
}
