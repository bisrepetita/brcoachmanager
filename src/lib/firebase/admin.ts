import { getApps, initializeApp, cert, type App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

function parsePrivateKey(raw: string | undefined): string {
  if (!raw) throw new Error('FIREBASE_ADMIN_PRIVATE_KEY est vide')
  const key = raw.replace(/\\n/g, '\n').trim()
  if (key.startsWith('-----')) return key
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`
}

// Initialisation lazy — ne plante pas au niveau module, seulement à l'utilisation
let _app: App | undefined

export function getAdminApp(): App {
  if (_app) return _app
  const existing = getApps()
  if (existing.length > 0) { _app = existing[0]; return _app! }

  _app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: parsePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    }),
  })
  return _app
}

export function getAdminDb() { return getFirestore(getAdminApp()) }
export function getAdminAuth() { return getAuth(getAdminApp()) }
