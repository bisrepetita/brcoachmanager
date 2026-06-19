import dynamic from 'next/dynamic'

// ssr: false — Firebase (auth, firestore) uses browser-only APIs at module
// evaluation time and cannot run in Node.js during SSR.
export const DynamicAuthProvider = dynamic(
  () => import('./AuthProvider').then((m) => m.AuthProvider),
  { ssr: false, loading: () => null }
)
