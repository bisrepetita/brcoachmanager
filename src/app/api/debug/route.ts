export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    stripe: !!process.env.STRIPE_SECRET_KEY,
    firebaseProjectId: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
    firebaseClientEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    firebasePrivateKey: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    stripeKeyPrefix: process.env.STRIPE_SECRET_KEY?.slice(0, 7) ?? 'absent',
  })
}
