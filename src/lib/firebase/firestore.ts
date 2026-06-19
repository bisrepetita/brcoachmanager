import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'
import { firebaseApp } from './config'

let _db: Firestore | null = null

export function getDb(): Firestore {
  if (_db) return _db

  // Serveur (SSR) : pas d'IndexedDB — Firestore sans persistence
  if (typeof window === 'undefined') {
    _db = getFirestore(firebaseApp)
    return _db
  }

  try {
    _db = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  } catch {
    // initializeFirestore ne peut être appelé qu'une fois (HMR)
    _db = getFirestore(firebaseApp)
  }

  return _db
}

export const db = getDb()
