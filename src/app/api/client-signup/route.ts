import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  let tokenEmail: string | undefined
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    uid = decoded.uid
    tokenEmail = decoded.email
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { firstName, lastName, phone } = (await req.json()) as {
    firstName: string
    lastName: string
    phone?: string
  }
  const email = tokenEmail
  if (!email) return NextResponse.json({ error: 'Email manquant sur le compte' }, { status: 400 })
  if (!firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json({ error: 'Prénom et nom requis' }, { status: 400 })
  }

  try {
    const adminDb = getAdminDb()

    // Idempotence : si le compte a déjà été lié (retry après échec réseau côté client), on renvoie l'état existant.
    const existingUserSnap = await adminDb.collection('users').doc(uid).get()
    if (existingUserSnap.exists) {
      const existingClientSnap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
      return NextResponse.json({ clientId: existingClientSnap.docs[0]?.id ?? null, linked: true })
    }

    let matches = await adminDb.collection('clients').where('email', '==', email).limit(5).get()
    if (matches.empty && phone?.trim()) {
      matches = await adminDb.collection('clients').where('phone', '==', phone.trim()).limit(5).get()
    }

    let clientId: string
    let linked: boolean

    if (!matches.empty) {
      const sorted = matches.docs.slice().sort((a, b) => {
        const aTime = a.data()['createdAt']?.toMillis?.() ?? 0
        const bTime = b.data()['createdAt']?.toMillis?.() ?? 0
        return aTime - bTime
      })
      const chosen = sorted[0]!
      clientId = chosen.id
      linked = true

      await chosen.ref.update({ uid, updatedAt: FieldValue.serverTimestamp() })

      if (sorted.length > 1) {
        await adminDb.collection('activityLogs').add({
          userId: uid,
          userFirstName: firstName,
          userLastName: lastName,
          action: 'client_signup_ambiguous_match',
          description: `Signup ${email} : ${sorted.length} fiches clients correspondantes, liaison à la plus ancienne (${clientId})`,
          clientId,
          createdAt: FieldValue.serverTimestamp(),
        })
      }
    } else {
      const newClientRef = adminDb.collection('clients').doc()
      clientId = newClientRef.id
      linked = false
      await newClientRef.set({
        firstName,
        lastName,
        email,
        phone: phone ?? '',
        sessionCredits: 0,
        visibleToCoachIds: [],
        uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    await adminDb.collection('users').doc(uid).set({
      firstName,
      lastName,
      email,
      phone: phone ?? '',
      roles: ['client'],
      active: true,
      color: '#7A7570',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    await adminDb.collection('activityLogs').add({
      userId: uid,
      userFirstName: firstName,
      userLastName: lastName,
      action: 'client_signup',
      description: linked ? `Compte lié à la fiche client existante ${clientId}` : `Nouvelle fiche client créée (${clientId})`,
      clientId,
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ clientId, linked })
  } catch (err) {
    console.error('[client-signup]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
