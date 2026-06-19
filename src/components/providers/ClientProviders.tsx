'use client'

import { useEffect } from 'react'
import { DynamicAuthProvider } from './authProviderLoader'

function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <DynamicAuthProvider>
      <ServiceWorkerRegistrar />
      {children}
    </DynamicAuthProvider>
  )
}
