import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'

// Résout prénom/nom des inscrits d'une séance collective pour son coach assigné (ou un admin), via
// Admin SDK — contourne volontairement `visibleToCoachIds` : ce champ sert à scoper la liste/recherche
// générale des clients, pas à cacher à un coach l'identité des gens inscrits à SA propre séance
// (ex: un client importé et scopé à un autre coach peut légitimement s'inscrire ailleurs).
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { groupSessionId } = (await req.json()) as { groupSessionId?: string }
  if (!groupSessionId) return NextResponse.json({ error: 'groupSessionId requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()

    const callerSnap = await adminDb.collection('users').doc(uid).get()
    const roles = (callerSnap.data() as { roles?: string[] } | undefined)?.roles ?? []
    const isAdmin = roles.includes('admin')

    const gsSnap = await adminDb.collection('groupSessions').doc(groupSessionId).get()
    if (!gsSnap.exists) return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 })
    const gsData = gsSnap.data()!
    const coachIds = (gsData['coachIds'] as string[] | undefined) ?? []

    if (!isAdmin && !coachIds.includes(uid)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const enrollments = (gsData['enrollments'] as Array<{ clientId?: string }> | undefined) ?? []
    const clientIds = [...new Set(enrollments.map((e) => e.clientId).filter((id): id is string => !!id))]

    const clients: Record<string, { firstName: string; lastName: string }> = {}
    await Promise.all(clientIds.map(async (id) => {
      const snap = await adminDb.collection('clients').doc(id).get()
      if (snap.exists) {
        clients[id] = {
          firstName: (snap.data()?.['firstName'] as string) ?? '',
          lastName: (snap.data()?.['lastName'] as string) ?? '',
        }
      }
    }))

    return NextResponse.json({ clients })
  } catch (err) {
    console.error('[group-sessions/resolve-participants]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
