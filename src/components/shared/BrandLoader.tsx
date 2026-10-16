// Indicateur de chargement : l'icône BR qui respire, avec deux échos qui s'en échappent
// (cf. .br-loader dans globals.css). N'apparaît qu'après 0,2 s pour éviter un flash sur les
// chargements instantanés.
export function BrandLoader({ size = 48, fullScreen, label }: { size?: number; fullScreen?: boolean; label?: string }) {
  const height = Math.round(size * 224 / 256)
  return (
    <div
      className="br-loader"
      role="status"
      aria-label={label ?? 'Chargement'}
      style={fullScreen ? { minHeight: '70dvh' } : { padding: '32px 0' }}
    >
      <div className="br-loader-mark" style={{ width: size, height }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="br-loader-echo" src="/logo-icon.png" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="br-loader-echo delayed" src="/logo-icon.png" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="br-loader-main" src="/logo-icon.png" alt="" />
      </div>
      {label && <p style={{ margin: 0, fontSize: 13, color: '#6E6E6B' }}>{label}</p>}
    </div>
  )
}
