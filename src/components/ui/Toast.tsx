'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { X } from 'lucide-react'

interface Toast { id: number; title: string; body?: string }
interface ToastContextValue { showToast: (title: string, body?: string) => void }

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() { return useContext(ToastContext) }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const showToast = useCallback((title: string, body?: string) => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, title, body }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, width: 'min(360px, calc(100vw - 32px))', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: '#1A1A18', borderRadius: 12, padding: '12px 16px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)', display: 'flex', gap: 10, alignItems: 'flex-start', pointerEvents: 'auto', animation: 'slideDown 0.2s ease' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{t.title}</p>
              {t.body && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{t.body}</p>}
            </div>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes slideDown { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </ToastContext.Provider>
  )
}
