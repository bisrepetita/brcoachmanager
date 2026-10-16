'use client'

import { useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { C, pageTitle, primaryButton } from '@/components/client/ClientUI'

// Servie par le service worker (public/sw.js) quand une navigation échoue faute de réseau.
export default function OfflinePage() {
  // Rechargement automatique dès que le réseau revient
  useEffect(() => {
    const reload = () => window.location.reload()
    window.addEventListener('online', reload)
    return () => window.removeEventListener('online', reload)
  }, [])

  return (
    <div className="client-theme" style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 32px', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', height: 40 }}>
          <BrandLogo />
        </header>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 40 }}>
          <span style={{
            width: 72, height: 72, borderRadius: 9999, background: C.stone, color: C.ink, marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <WifiOff size={28} strokeWidth={1.75} />
          </span>
          <h1 style={{ ...pageTitle, margin: '0 0 10px' }}>Pas de connexion</h1>
          <p style={{ margin: 0, fontSize: 16, color: C.muted, lineHeight: 1.5 }}>
            Les données déjà consultées restent disponibles. Tes modifications seront synchronisées dès le retour du réseau.
          </p>
          <button onClick={() => window.location.reload()} style={{ ...primaryButton, height: 50, marginTop: 28 }}>
            Réessayer
          </button>
          <p style={{ margin: '14px 0 0', fontSize: 13, color: C.muted, textAlign: 'center' }}>
            La page se rechargera toute seule dès que le réseau revient.
          </p>
        </div>
      </div>
    </div>
  )
}
