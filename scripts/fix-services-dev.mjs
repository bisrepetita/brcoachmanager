import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const sa = JSON.parse(readFileSync(join(__dirname, 'service-account-dev.json'), 'utf8'))
if (!getApps().length) initializeApp({ credential: cert(sa) })

const db = getFirestore()

async function run() {
  const snap = await db.collection('services').get()
  let fixed = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    if (data.basePrice !== undefined && data.price === undefined) {
      await doc.ref.update({ price: data.basePrice })
      console.log(`✓ ${data.name} : basePrice ${data.basePrice} → price`)
      fixed++
    }
  }
  console.log(`\n✅ ${fixed} service(s) corrigé(s)`)
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
