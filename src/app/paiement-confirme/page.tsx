'use client'

import { CheckCircle2 } from 'lucide-react'

export default function PaiementConfirmePage() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: '#F9F8F6', padding: 24, textAlign: 'center',
    }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#EAF7EF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle2 size={30} color="#2D7A4F" />
      </div>
      <div>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#1A1A18', margin: '0 0 6px' }}>Paiement confirmé</p>
        <p style={{ fontSize: 14, color: '#7A7570', margin: 0, maxWidth: 280 }}>
          Ta séance a bien été payée. À très vite chez Bis Repetita !
        </p>
      </div>
    </div>
  )
}
