// Remplit `enrolledClientIds` (clientId des inscriptions actives) sur toutes les séances
// collectives existantes — à lancer une fois par environnement après le déploiement du code qui
// maintient ce champ à chaque inscription/annulation. Idempotent.
//   node scripts/backfill-enrolled-client-ids.mjs dev [--dry-run]
//   node scripts/backfill-enrolled-client-ids.mjs prod [--dry-run]
import { readFileSync } from 'fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const target = process.argv[2]
const DRY_RUN = process.argv.includes('--dry-run')
const files = { dev: 'scripts/service-account-dev.json', prod: 'scripts/service-account.json' }
if (!files[target]) throw new Error('Usage : node scripts/backfill-enrolled-client-ids.mjs dev|prod [--dry-run]')

const sa = JSON.parse(readFileSync(files[target], 'utf8'))
const expectedProject = target === 'dev' ? 'brcoachmanager-dev' : 'brcoachmanager'
if (sa.project_id !== expectedProject) throw new Error(`Service account ${sa.project_id} ≠ ${expectedProject}`)
initializeApp({ credential: cert(sa) })
const db = getFirestore()

function activeEnrolledClientIds(enrollments) {
  return [...new Set(enrollments
    .filter((e) => e.status !== 'cancelled' && typeof e.clientId === 'string')
    .map((e) => e.clientId))]
}

const snap = await db.collection('groupSessions').get()
let changed = 0
let batch = db.batch()
let inBatch = 0
for (const doc of snap.docs) {
  const ids = activeEnrolledClientIds(doc.data().enrollments ?? [])
  const current = doc.data().enrolledClientIds
  if (Array.isArray(current) && current.length === ids.length && ids.every((id) => current.includes(id))) continue
  changed++
  if (DRY_RUN) continue
  batch.update(doc.ref, { enrolledClientIds: ids })
  if (++inBatch === 400) { await batch.commit(); batch = db.batch(); inBatch = 0 }
}
if (!DRY_RUN && inBatch > 0) await batch.commit()
console.log(`${sa.project_id} : ${snap.size} séances, ${changed} ${DRY_RUN ? 'à mettre à jour (dry-run)' : 'mises à jour'}`)
