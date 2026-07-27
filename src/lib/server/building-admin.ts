import type { Firestore } from 'firebase-admin/firestore'

async function resolveBuildingData(adminDb: Firestore, locationId?: string): Promise<{ accessInstructions?: string; photos?: string[] } | undefined> {
  if (!locationId) return undefined
  const locSnap = await adminDb.collection('locations').doc(locationId).get()
  if (!locSnap.exists) return undefined
  const buildingId = locSnap.data()?.['buildingId'] as string | undefined
  if (!buildingId) return undefined
  const buildingSnap = await adminDb.collection('buildings').doc(buildingId).get()
  if (!buildingSnap.exists) return undefined
  return {
    accessInstructions: buildingSnap.data()?.['accessInstructions'] as string | undefined,
    photos: buildingSnap.data()?.['photos'] as string[] | undefined,
  }
}

export async function resolveAccessInstructions(adminDb: Firestore, locationId?: string): Promise<string | undefined> {
  return (await resolveBuildingData(adminDb, locationId))?.accessInstructions
}

export async function resolveAccessInfo(adminDb: Firestore, locationId?: string): Promise<{ accessInstructions?: string; photos?: string[] }> {
  return (await resolveBuildingData(adminDb, locationId)) ?? {}
}
