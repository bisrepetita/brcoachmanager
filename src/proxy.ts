import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16 : ce fichier remplace la convention `middleware.ts`. Aucune redirection en dur ici —
// la route racine `/` gère elle-même sa redirection côté client selon l'état d'authentification
// réel (anonyme/client → /group-sessions, coach/admin → /calendar), cf. src/app/page.tsx. Un
// redirect serveur inconditionnel ici court-circuiterait complètement cette logique (c'était le
// cas avant : tout le monde était renvoyé vers /calendar avant même que React ne s'exécute).
export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|api).*)',
  ],
}
