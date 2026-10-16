import { BrandLoader } from '@/components/shared/BrandLoader'

// Affiché par Next.js pendant le chargement d'une page de l'espace client.
export default function ClientLoading() {
  return <BrandLoader fullScreen />
}
