import type { Timestamp } from 'firebase/firestore'

// ─── Rôles ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'coach'

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
}

export interface RoomRentalEntry {
  coachId: string
  amountDueToCompany: number
  status: 'pending' | 'paid' | 'waived'
  paidAt?: Timestamp
}

export interface Session {
  id: string
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
  updatedAt: Timestamp
}

// ─── Helpers de vues ─────────────────────────────────────────────────────────

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: 'Planifié',
  done: 'Effectué',
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
