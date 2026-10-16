// Logo "bis repetita" (PNG transparent, ratio 1940×284) — en-têtes de l'espace client.
export function BrandLogo({ height = 20 }: { height?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-bis-repetita.png"
      alt="Bis Repetita"
      height={height}
      width={Math.round(height * 1940 / 284)}
      style={{ height, width: 'auto', display: 'block' }}
    />
  )
}
