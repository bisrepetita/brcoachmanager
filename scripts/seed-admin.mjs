import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'

// ESM __dirname
const __dirname = dirname(fileURLToPath(import.meta.url))

// Charger .env.local
config({ path: join(__dirname, '..', '.env.local') })

// Vérifier service-account.json
const serviceAccountPath = join(__dirname, 'service-account.json')
if (!existsSync(serviceAccountPath)) {
  console.error('\n❌ Fichier manquant : scripts/service-account.json')
  console.error('\nComment l\'obtenir :')
  console.error('  1. Firebase Console → ⚙️ Paramètres du projet → Comptes de service')
  console.error('  2. Cliquer "Générer une nouvelle clé privée"')
  console.error('  3. Renommer le fichier en service-account.json')
  console.error('  4. Le placer dans le dossier scripts/')
  process.exit(1)
}

// Imports firebase-admin ESM (v11+)
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) })
}

const db = getFirestore()
const auth = getAuth()

async function run() {
  console.log('\n🚀 BRCoachManager — Seed initial\n')

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'nicolas.deboccard@gmail.com'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD

  let uid

  // Chercher si l'utilisateur Auth existe déjà
  try {
    const existing = await auth.getUserByEmail(adminEmail)
    uid = existing.uid
    console.log(`✓ Utilisateur Auth existant : ${adminEmail} (uid: ${uid})`)
  } catch {
    if (!adminPassword) {
      console.error('\n❌ Compte Auth introuvable.')
      console.error('   Option A : Ajoute SEED_ADMIN_PASSWORD=tonmotdepasse dans .env.local')
      console.error('   Option B : Crée le compte dans Firebase Console → Authentication → Users\n')
      process.exit(1)
    }
    const created = await auth.createUser({ email: adminEmail, password: adminPassword })
    uid = created.uid
    console.log(`✓ Compte Auth créé : ${adminEmail} (uid: ${uid})`)
  }

  // Créer le document users/{uid}
  const now = Timestamp.now()

  await db.collection('users').doc(uid).set({
    firstName: 'Nicolas',
    lastName: 'De Boccard',
    email: adminEmail,
    phone: '',
    roles: ['admin', 'coach'],
    active: true,
    color: '#6366F1',
    createdAt: now,
    updatedAt: now,
  }, { merge: true })

  console.log(`✓ Document Firestore users/${uid} créé`)

  // Créer settings/app si absent
  const settingsRef = db.collection('settings').doc('app')
  const settingsSnap = await settingsRef.get()

  if (!settingsSnap.exists) {
    await settingsRef.set({
      companyName: 'Bis Repetita',
      phone: '',
      email: adminEmail,
      whatsappTemplate: 'Bonjour {prenom}, voici le lien pour le paiement de ta séance du {date} : {twintLink}',
      defaultSessionDuration: 60,
      updatedAt: now,
    })
    console.log('✓ Document settings/app créé')
  } else {
    console.log('✓ settings/app déjà existant — ignoré')
  }

  console.log('\n✅ Seed terminé !')
  console.log(`\n   Email : ${adminEmail}`)
  console.log(`   UID   : ${uid}`)
  console.log('\n   Tu peux maintenant lancer : npm run dev\n')

  process.exit(0)
}

run().catch((err) => {
  console.error('\n❌ Erreur :', err.message)
  process.exit(1)
})
