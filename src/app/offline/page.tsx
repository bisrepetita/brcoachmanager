import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: '#F9F8F6', padding: 24, textAlign: 'center',
    }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <WifiOff size={24} color="#7A7570" />
      </div>
      <div>
        <p style={{ fontSize: 17, fontWeight: 600, color: '#1A1A18', margin: '0 0 6px' }}>Pas de connexion</p>
        <p style={{ fontSize: 14, color: '#7A7570', margin: 0, maxWidth: 260 }}>
          Les données déjà consultées restent disponibles. Tes modifications seront synchronisées dès le retour du réseau.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{ marginTop: 8, padding: '10px 24px', borderRadius: 8, border: '1px solid #E5E1DA', background: '#fff', color: '#1A1A18', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
      >
        Réessayer
      </button>
    </div>
  )
}
