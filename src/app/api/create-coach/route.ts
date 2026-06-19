import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    const adminAuth = getAdminAuth()
    const decoded = await adminAuth.verifyIdToken(token)
    const adminDb = getAdminDb()
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get()
    const roles: string[] = (userSnap.data() as { roles?: string[] })?.roles ?? []
    if (!roles.includes('admin')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { firstName, lastName, email, phone, roles, color, isIndependent } = await req.json()

  try {
    const adminAuth = getAdminAuth()
    const adminDb = getAdminDb()

    // Crée l'utilisateur via Admin SDK (ne touche pas à la session courante)
    const userRecord = await adminAuth.createUser({
      email,
      emailVerified: false,
      displayName: `${firstName} ${lastName}`,
    })

    await adminDb.collection('users').doc(userRecord.uid).set({
      firstName,
      lastName,
      email,
      phone: phone ?? '',
      roles,
      active: true,
      color,
      isIndependent: isIndependent ?? false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Envoie un lien de définition du mot de passe
    await adminAuth.generatePasswordResetLink(email)

    // Utilise le client SDK pour envoyer l'email (Admin SDK ne peut pas envoyer directement)
    // On retourne l'uid et on envoie l'email depuis le client
    return NextResponse.json({ uid: userRecord.uid })
  } catch (err) {
    console.error('[create-coach]', err)
    const msg = (err as Error).message ?? String(err)
    if (msg.includes('already exists')) {
      return NextResponse.json({ error: 'Un compte existe déjà avec cet email.' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
