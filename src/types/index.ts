import type { Timestamp } from 'firebase/firestore'

// ─── Rôles ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'coach' | 'client'

// ─── Utilisateur / Coach ─────────────────────────────────────────────────────

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  roles: UserRole[]
  active: boolean
  color: string
  fcmToken?: string | null
  googleCalendarUrl?: string
  icalSecret?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Client ──────────────────────────────────────────────────────────────────

export interface Client {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  address?: string
  postalCode?: string
  city?: string
  additionalInfo?: string
  notesAdminOnly?: string
  sessionCredits: number
  visibleToCoachIds: string[]
  uid?: string
  hasEverBooked?: boolean
  activeSubscriptionId?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Groupe de clients ────────────────────────────────────────────────────────

export interface ClientGroup {
  id: string
  name: string
  clientIds: string[]
  notes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Lieu ─────────────────────────────────────────────────────────────────────

export interface Location {
  id: string
  name: string
  address?: string
  notes?: string
  active: boolean
  allowMultipleBookings: boolean
  maxSimultaneous: number
  allowCoachTraining?: boolean
  order?: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Service ──────────────────────────────────────────────────────────────────

export type PricingMode = 'per_person' | 'split_between_group'

export interface Service {
  id: string
  name: string
  price: number
  pricingMode: PricingMode
  independentRoomRentalPrice: number
  active: boolean
  assignedCoachIds?: string[]
  isPublic?: boolean
  firstBookingFree?: boolean
  imageUrl?: string
  order?: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Récurrence ───────────────────────────────────────────────────────────────

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  dayOfWeek: number
  startTime: string
  duration: number
  startDate: Timestamp
  endDate?: Timestamp
  count?: number
}

export interface Recurrence {
  id: string
  coachIds: string[]
  serviceId: string
  locationId: string
  clientIds: string[]
  clientGroupId?: string
  rule: RecurrenceRule
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Séance ───────────────────────────────────────────────────────────────────

export type SessionStatus = 'planned' | 'done' | 'cancelled'

export type PaymentStatus =
  | 'payment_to_request'
  | 'link_sent'
  | 'paid'
  | 'offered'
  | 'credits'
  | 'cancelled'

export interface PriceSnapshot {
  serviceName: string
  basePrice: number
  pricingMode: PricingMode
  customTotalPrice?: number
  customPricePerClient?: number
}

export interface ClientPayment {
  clientId: string
  amountDue: number
  amountPaid: number
  paymentStatus: PaymentStatus
  twintLink?: string
  payrexxTransactionId?: string
  paidAt?: Timestamp
  discountId?: string
  discountLabel?: string
  originalAmountDue?: number
}

export interface RoomRentalEntry {
  coachId: string
  amountDueToCompany: number
  status: 'pending' | 'paid' | 'waived'
  paidAt?: Timestamp
}

export type SessionType = 'standard' | 'coach_training'

export interface Session {
  id: string
  sessionType?: SessionType
  coachIds: string[]
  clientIds: string[]
  clientGroupId?: string
  locationId: string
  serviceId: string
  startAt: Timestamp
  endAt: Timestamp
  isIndependent: boolean
  recurrenceId?: string
  status: SessionStatus
  paymentStatus: PaymentStatus
  paymentDistribution: ClientPayment[]
  priceSnapshot: PriceSnapshot
  roomRentalSnapshot?: RoomRentalEntry[]
  sessionNote?: string
  offeredReason?: string
  whatsappMessageSentAt?: Timestamp
  reminderSentAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  cancelledAt?: Timestamp
}

// ─── Séance collective (auto-inscription client) ─────────────────────────────

export type GroupSessionStatus = 'planned' | 'done' | 'cancelled'

export type GroupSessionLevel = 'debutant' | 'intermediaire' | 'avance' | 'tous_niveaux'

export type GroupSessionEnrollmentStatus = 'pending_payment' | 'confirmed' | 'cancelled'

export interface GroupSessionEnrollment {
  clientId: string
  status: GroupSessionEnrollmentStatus
  amountDue: number
  amountPaid: number
  paymentStatus: PaymentStatus
  stripeCheckoutUrl?: string
  stripeSessionId?: string
  enrolledAt: Timestamp
  cancelledAt?: Timestamp
  paidAt?: Timestamp
  discountId?: string
  discountLabel?: string
  originalAmountDue?: number
  offeredReason?: string
  subscriptionId?: string
}

export interface GroupSession {
  id: string
  title: string
  description?: string
  coachIds: string[]
  coachNames?: string[]
  locationId: string
  serviceId?: string
  startAt: Timestamp
  endAt: Timestamp
  // Dénormalisés depuis startAt au moment de la création (heure locale du navigateur) — évite
  // tout recalcul de jour/heure depuis le Timestamp côté serveur (Admin SDK tourne en UTC, pas
  // en Europe/Zurich), nécessaire pour matcher un créneau fixe d'abonnement de façon fiable.
  dayOfWeek?: number
  startTime?: string
  maxParticipants: number
  price: number
  level?: GroupSessionLevel
  status: GroupSessionStatus
  isPublic: boolean
  enrollments: GroupSessionEnrollment[]
  recurrenceId?: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  cancelledAt?: Timestamp
}

export interface GroupSessionRecurrence {
  id: string
  title: string
  description?: string
  coachIds: string[]
  coachNames?: string[]
  locationId: string
  serviceId?: string
  maxParticipants: number
  price: number
  level?: GroupSessionLevel
  isPublic: boolean
  createdBy: string
  rule: RecurrenceRule
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Abonnements ────────────────────────────────────────────────────────────

export type SubscriptionDurationUnit = 'weeks' | 'months'

export interface SubscriptionFixedSlot {
  dayOfWeek: number // convention JS : 0=dimanche .. 6=samedi (comme RecurrenceRule.dayOfWeek)
  startTime: string // "HH:mm"
  serviceId: string
}

export interface SubscriptionPlan {
  id: string
  name: string
  description?: string
  durationValue: number
  durationUnit: SubscriptionDurationUnit
  serviceIds: string[]
  sessionsPerWeek: number
  fixedSlot?: SubscriptionFixedSlot
  price: number
  isPublic: boolean
  active: boolean
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ClientSubscriptionPlanSnapshot {
  name: string
  serviceIds: string[]
  sessionsPerWeek: number
  fixedSlot?: SubscriptionFixedSlot
  durationValue: number
  durationUnit: SubscriptionDurationUnit
  price: number
}

// 'pending_payment' : créé par l'achat en self-service, en attente de confirmation du webhook
// Stripe — jamais posé comme Client.activeSubscriptionId tant qu'il n'est pas passé à 'active'.
export type ClientSubscriptionStatus = 'pending_payment' | 'active' | 'cancelled'

export interface ClientSubscription {
  id: string
  clientId: string
  uid?: string
  planId: string
  planSnapshot: ClientSubscriptionPlanSnapshot
  startAt: Timestamp
  endAt: Timestamp
  status: ClientSubscriptionStatus
  paymentStatus: PaymentStatus
  amountDue: number
  amountPaid: number
  source: 'manual' | 'self_purchase'
  stripeCheckoutUrl?: string
  stripeSessionId?: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface SubscriptionConsumption {
  id: string
  clientId: string
  uid: string
  groupSessionId: string
  sessionStartAt: Timestamp
  consumedAt: Timestamp
}

// ─── Vente hors séance ────────────────────────────────────────────────────────

export interface Sale {
  id: string
  serviceId: string
  coachIds: string[]
  clientIds: string[]
  clientGroupId?: string
  pricingMode: PricingMode
  paymentDistribution: ClientPayment[]
  paymentStatus: PaymentStatus
  note?: string
  offeredReason?: string
  priceSnapshot: {
    serviceName: string
    basePrice: number
    pricingMode: PricingMode
    customTotalPrice?: number
    customPricePerClient?: number
  }
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Remises (codes promo & rabais clients) ──────────────────────────────────

export type DiscountKind = 'code' | 'client'
export type DiscountValueType = 'percentage' | 'fixed_amount'

export interface DiscountScope {
  serviceIds: string[]        // vide = tous les services (ignoré si allPublicServices=true)
  allPublicServices: boolean  // matche dynamiquement tout service isPublic===true
}

export interface Discount {
  id: string
  kind: DiscountKind
  code?: string                 // kind='code' uniquement, stocké en majuscules, unique
  clientId?: string              // kind='client' uniquement — id du doc `clients`
  discountType: DiscountValueType
  value: number                  // pourcentage (0-100) ou montant CHF selon discountType
  scope: DiscountScope
  startAt?: Timestamp
  endAt?: Timestamp
  maxUsesGlobal?: number
  maxUsesPerClient?: number
  usesCount: number
  active: boolean
  note?: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface DiscountRedemption {
  id: string
  clientId: string
  context: 'session' | 'sale' | 'group_session'
  refId: string
  amountBefore: number
  amountAfter: number
  createdAt: Timestamp
}

// ─── Disponibilités ───────────────────────────────────────────────────────────

export interface AvailabilitySlot {
  id: string
  coachId: string
  startAt: Timestamp
  endAt: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface RecurringAvailability {
  id: string
  coachId: string
  dayOfWeek: DayOfWeek
  startTime: string  // 'HH:mm'
  endTime: string    // 'HH:mm'
  active: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Suivi indépendant ────────────────────────────────────────────────────────

export interface RoomRentalPayment {
  id: string
  coachId: string
  amount: number
  note?: string
  appliedToSessionIds: string[]
  createdBy: string
  createdAt: Timestamp
}

// ─── Crédits ──────────────────────────────────────────────────────────────────

export type CreditTransactionType = 'add' | 'use' | 'correction'

export interface CreditTransaction {
  id: string
  clientId: string
  type: CreditTransactionType
  quantity: number
  sessionId?: string
  note?: string
  createdBy: string
  createdAt: Timestamp
}

// ─── Paramètres app ───────────────────────────────────────────────────────────

export interface AppSettings {
  companyName: string
  phone?: string
  email?: string
  logoUrl?: string
  whatsappTemplate: string
  defaultSessionDuration: number
  twintBaseLink?: string
  groupSessionCancellationDeadlineHours?: number
  updatedAt: Timestamp
}

// ─── Helpers de vues ─────────────────────────────────────────────────────────

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: 'Planifié',
  done: 'Effectué',
  cancelled: 'Annulé',
}

export const GROUP_SESSION_STATUS_LABELS: Record<GroupSessionStatus, string> = {
  planned: 'Planifié',
  done: 'Effectué',
  cancelled: 'Annulé',
}

export const GROUP_SESSION_LEVEL_LABELS: Record<GroupSessionLevel, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
  tous_niveaux: 'Tous niveaux',
}

export const SUBSCRIPTION_DURATION_UNIT_LABELS: Record<SubscriptionDurationUnit, string> = {
  weeks: 'semaine(s)',
  months: 'mois',
}

export const DAY_OF_WEEK_LABELS: Record<number, string> = {
  0: 'Dimanche',
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
}

export const GROUP_SESSION_ENROLLMENT_STATUS_LABELS: Record<GroupSessionEnrollmentStatus, string> = {
  pending_payment: 'Paiement à effectuer',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  payment_to_request: 'Paiement à demander',
  link_sent: 'Lien envoyé',
  paid: 'Payé',
  offered: 'Offert',
  credits: 'Crédits',
  cancelled: 'Annulé',
}

export const DISCOUNT_VALUE_TYPE_LABELS: Record<DiscountValueType, string> = {
  percentage: 'Pourcentage',
  fixed_amount: 'Montant fixe',
}

export const COACH_COLORS = [
  '#6366F1',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
] as const
