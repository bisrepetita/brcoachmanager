import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, 'service-account-dev.json'), 'utf8')
)

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) })
}

const db = getFirestore()
const auth = getAuth()

const ADMIN_EMAIL = 'nicolas.deboccard@gmail.com'
const ADMIN_PASSWORD = 'test1234'

async function createOrGetUser(email, password, displayName) {
  try {
    const existing = await auth.getUserByEmail(email)
    console.log(`  ↩ Utilisateur existant : ${email}`)
    return existing.uid
  } catch {
    const created = await auth.createUser({ email, password, displayName })
    console.log(`  ✓ Utilisateur créé : ${email}`)
    return created.uid
  }
}

async function run() {
  console.log('\n🚀 BRCoachManager DEV — Seed\n')
  const now = Timestamp.now()

  // ─── 1. Admin / Coach principal ──────────────────────────────────────────
  console.log('👤 Utilisateurs')
  const adminUid = await createOrGetUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'Nicolas De Boccard')

  await db.collection('users').doc(adminUid).set({
    firstName: 'Nicolas',
    lastName: 'De Boccard',
    email: ADMIN_EMAIL,
    phone: '+41 79 000 00 00',
    roles: ['admin', 'coach'],
    active: true,
    color: '#6366F1',
    isIndependent: false,
    createdAt: now,
    updatedAt: now,
  }, { merge: true })
  console.log(`  ✓ Admin/Coach : ${ADMIN_EMAIL} — mot de passe : ${ADMIN_PASSWORD}`)

  const coachUid = await createOrGetUser('coach.test@bisrepetita.ch', 'test1234', 'Sophie Martin')
  await db.collection('users').doc(coachUid).set({
    firstName: 'Sophie',
    lastName: 'Martin',
    email: 'coach.test@bisrepetita.ch',
    phone: '+41 79 111 11 11',
    roles: ['coach'],
    active: true,
    color: '#EC4899',
    isIndependent: false,
    createdAt: now,
    updatedAt: now,
  }, { merge: true })
  console.log(`  ✓ Coach : coach.test@bisrepetita.ch — mot de passe : test1234`)

  // ─── 2. Clients ──────────────────────────────────────────────────────────
  console.log('\n👥 Clients')
  const clientsData = [
    { firstName: 'Alice',   lastName: 'Dupont',    email: 'alice@test.ch',   phone: '+41 79 200 00 01', coachId: adminUid },
    { firstName: 'Bruno',   lastName: 'Favre',     email: 'bruno@test.ch',   phone: '+41 79 200 00 02', coachId: adminUid },
    { firstName: 'Camille', lastName: 'Rochat',    email: 'camille@test.ch', phone: '+41 79 200 00 03', coachId: coachUid },
    { firstName: 'David',   lastName: 'Müller',    email: 'david@test.ch',   phone: '+41 79 200 00 04', coachId: coachUid },
    { firstName: 'Emma',    lastName: 'Schneider', email: 'emma@test.ch',    phone: '+41 79 200 00 05', coachId: adminUid },
  ]

  const clientIds = []
  for (const c of clientsData) {
    const ref = db.collection('clients').doc()
    await ref.set({
      ...c,
      credits: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    clientIds.push(ref.id)
    console.log(`  ✓ ${c.firstName} ${c.lastName}`)
  }

  // ─── 3. Groupe ───────────────────────────────────────────────────────────
  console.log('\n👨‍👩‍👧 Groupe')
  const groupRef = db.collection('clientGroups').doc()
  await groupRef.set({
    name: 'Groupe Cardio Lundi',
    clientIds: [clientIds[0], clientIds[1], clientIds[2]],
    coachIds: [adminUid],
    createdAt: now,
    updatedAt: now,
  })
  console.log(`  ✓ Groupe Cardio Lundi (3 membres)`)
  const groupId = groupRef.id

  // ─── 4. Services ─────────────────────────────────────────────────────────
  console.log('\n🏋️ Services')
  const servicesData = [
    { name: 'Séance individuelle 60min', price: 90,  pricingMode: 'per_person',          category: 'coaching', duration: 60 },
    { name: 'Séance individuelle 90min', price: 120, pricingMode: 'per_person',          category: 'coaching', duration: 90 },
    { name: 'Cours collectif',           price: 25,  pricingMode: 'per_person',          category: 'group',    duration: 60 },
    { name: 'Bilan forme',               price: 150, pricingMode: 'per_person',          category: 'coaching', duration: 90 },
    { name: 'Location salle (groupe)',   price: 200, pricingMode: 'split_between_group', category: 'other',    duration: 120 },
  ]

  const serviceIds = []
  for (const s of servicesData) {
    const ref = db.collection('services').doc()
    await ref.set({ ...s, active: true, createdAt: now, updatedAt: now })
    serviceIds.push(ref.id)
    console.log(`  ✓ ${s.name} — ${s.basePrice} CHF`)
  }

  // ─── 5. Séances ──────────────────────────────────────────────────────────
  console.log('\n📅 Séances de test')

  const msDay = 86400000
  const today = new Date(); today.setHours(10, 0, 0, 0)

  const sessionsData = [
    // Séance individuelle passée (à clôturer)
    {
      label: 'Séance Alice — à clôturer',
      serviceId: serviceIds[0],
      coachIds: [adminUid],
      clientIds: [clientIds[0]],
      startAt: Timestamp.fromDate(new Date(today.getTime() - msDay)),
      endAt:   Timestamp.fromDate(new Date(today.getTime() - msDay + 60 * 60000)),
      status: 'done',
      paymentStatus: 'payment_to_request',
      paymentDistribution: [{
        clientId: clientIds[0], paymentMethod: 'twint',
        paymentStatus: 'payment_to_request', amountDue: 90, amountPaid: 0,
      }],
      priceSnapshot: { serviceName: 'Séance individuelle 60min', basePrice: 90, pricingMode: 'per_person' },
    },
    // Séance groupe passée (à clôturer)
    {
      label: 'Cours collectif — groupe Cardio',
      serviceId: serviceIds[2],
      coachIds: [adminUid],
      clientIds: [],
      clientGroupId: groupId,
      startAt: Timestamp.fromDate(new Date(today.getTime() - 2 * msDay)),
      endAt:   Timestamp.fromDate(new Date(today.getTime() - 2 * msDay + 60 * 60000)),
      status: 'done',
      paymentStatus: 'payment_to_request',
      paymentDistribution: [
        { clientId: clientIds[0], paymentMethod: 'twint', paymentStatus: 'payment_to_request', amountDue: 25, amountPaid: 0 },
        { clientId: clientIds[1], paymentMethod: 'twint', paymentStatus: 'payment_to_request', amountDue: 25, amountPaid: 0 },
        { clientId: clientIds[2], paymentMethod: 'twint', paymentStatus: 'payment_to_request', amountDue: 25, amountPaid: 0 },
      ],
      priceSnapshot: { serviceName: 'Cours collectif', basePrice: 25, pricingMode: 'per_person' },
    },
    // Séance à venir (calendrier)
    {
      label: 'Séance Bruno — demain',
      serviceId: serviceIds[0],
      coachIds: [adminUid],
      clientIds: [clientIds[1]],
      startAt: Timestamp.fromDate(new Date(today.getTime() + msDay + 2 * 3600000)),
      endAt:   Timestamp.fromDate(new Date(today.getTime() + msDay + 3 * 3600000)),
      status: 'planned',
      paymentStatus: 'payment_to_request',
      paymentDistribution: [{
        clientId: clientIds[1], paymentMethod: 'twint',
        paymentStatus: 'payment_to_request', amountDue: 90, amountPaid: 0,
      }],
      priceSnapshot: { serviceName: 'Séance individuelle 60min', basePrice: 90, pricingMode: 'per_person' },
    },
    // Séance clôturée payée
    {
      label: 'Séance Emma — clôturée et payée',
      serviceId: serviceIds[1],
      coachIds: [adminUid],
      clientIds: [clientIds[4]],
      startAt: Timestamp.fromDate(new Date(today.getTime() - 5 * msDay)),
      endAt:   Timestamp.fromDate(new Date(today.getTime() - 5 * msDay + 90 * 60000)),
      status: 'closed',
      paymentStatus: 'paid',
      completedAt: Timestamp.fromDate(new Date(today.getTime() - 4 * msDay)),
      paymentDistribution: [{
        clientId: clientIds[4], paymentMethod: 'twint',
        paymentStatus: 'paid', amountDue: 120, amountPaid: 120,
      }],
      priceSnapshot: { serviceName: 'Séance individuelle 90min', basePrice: 120, pricingMode: 'per_person' },
    },
  ]

  for (const s of sessionsData) {
    const { label, ...sessionDoc } = s
    const ref = db.collection('sessions').doc()
    await ref.set({ ...sessionDoc, note: '', createdAt: now, updatedAt: now })
    console.log(`  ✓ ${label}`)
  }

  // ─── 6. Vente test ───────────────────────────────────────────────────────
  console.log('\n🛍️ Vente test')
  const saleRef = db.collection('sales').doc()
  await saleRef.set({
    serviceId: serviceIds[3],
    coachIds: [adminUid],
    clientIds: [clientIds[0], clientIds[1]],
    pricingMode: 'per_person',
    paymentStatus: 'payment_to_request',
    paymentDistribution: [
      { clientId: clientIds[0], paymentMethod: 'twint', paymentStatus: 'payment_to_request', amountDue: 150, amountPaid: 0 },
      { clientId: clientIds[1], paymentMethod: 'twint', paymentStatus: 'payment_to_request', amountDue: 150, amountPaid: 0 },
    ],
    priceSnapshot: { serviceName: 'Bilan forme', basePrice: 150, pricingMode: 'per_person' },
    createdAt: now,
    updatedAt: now,
  })
  console.log(`  ✓ Vente Bilan forme — Alice + Bruno`)

  // ─── 7. Settings ─────────────────────────────────────────────────────────
  console.log('\n⚙️  Settings')
  await db.collection('settings').doc('app').set({
    companyName: 'Bis Repetita DEV',
    phone: '+41 79 000 00 00',
    email: ADMIN_EMAIL,
    whatsappTemplate: 'Bonjour {prenom}, voici le lien pour le paiement de ta séance du {date} : {twintLink}',
    defaultSessionDuration: 60,
    updatedAt: now,
  }, { merge: true })
  console.log(`  ✓ settings/app`)

  // ─── Résumé ───────────────────────────────────────────────────────────────
  console.log(`
✅ Seed DEV terminé !

   🔑 Connexion admin :
      Email    : ${ADMIN_EMAIL}
      Password : ${ADMIN_PASSWORD}

   🔑 Connexion coach :
      Email    : coach.test@bisrepetita.ch
      Password : test1234

   📦 Données créées :
      • 2 utilisateurs (1 admin+coach, 1 coach)
      • 5 clients
      • 1 groupe (3 membres)
      • 5 services
      • 4 séances (2 à clôturer, 1 planifiée, 1 clôturée)
      • 1 vente test
`)

  process.exit(0)
}

run().catch(err => {
  console.error('\n❌ Erreur :', err.message)
  process.exit(1)
})
