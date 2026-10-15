import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { applyReferralOnSignup } from '@/lib/server/referral-admin'

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

  const body = (await req.json()) as { firstName: string; lastName?: string; phone?: string; referralCode?: string }
  const { firstName, phone } = body
  // Nom de famille optionnel : la connexion Google dérive prénom/nom du displayName du compte,
  // qui peut n'avoir qu'un seul mot (pas de nom de famille) — ça ne doit pas bloquer la création
  // du compte, contrairement au signup email/mot de passe qui valide déjà les deux côté formulaire.
  const lastName = body.lastName?.trim() ?? ''
  const email = tokenEmail
  if (!email) return NextResponse.json({ error: 'Email manquant sur le compte' }, { status: 400 })
  if (!firstName?.trim()) {
    return NextResponse.json({ error: 'Prénom requis' }, { status: 400 })
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

    // Fiche existante liée à un nouveau compte : les packs/abonnements attribués à la main avant la
    // création du compte n'ont pas d'uid — sans lui, les règles Firestore empêchent le client de
    // les voir (lecture filtrée sur uid). On le renseigne maintenant.
    if (linked) {
      const [packsSnap, subsSnap] = await Promise.all([
        adminDb.collection('clientPacks').where('clientId', '==', clientId).get(),
        adminDb.collection('clientSubscriptions').where('clientId', '==', clientId).get(),
      ])
      const batch = adminDb.batch()
      for (const d of [...packsSnap.docs, ...subsSnap.docs]) {
        if (!d.data()['uid']) batch.update(d.ref, { uid })
      }
      await batch.commit()
    }

    // Parrainage : best-effort, n'empêche jamais la création du compte.
    const referred = await applyReferralOnSignup(adminDb, clientId, body.referralCode).catch((err) => {
      console.error('[client-signup] parrainage', err)
      return false
    })

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
      description: (linked ? `Compte lié à la fiche client existante ${clientId}` : `Nouvelle fiche client créée (${clientId})`)
        + (referred ? ` — parrainé (code ${body.referralCode})` : ''),
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
