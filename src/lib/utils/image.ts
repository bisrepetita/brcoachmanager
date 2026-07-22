export async function fileToCompressedDataUrl(
  file: File,
  opts: { maxDimension?: number; startQuality?: number; maxBytes?: number; aspectRatio?: number } = {},
): Promise<string> {
  const { maxDimension = 1400, startQuality = 0.8, maxBytes = 900_000, aspectRatio } = opts
  const bitmap = await createImageBitmap(file)

  // Recadre au centre sur le ratio cible avant redimensionnement, pour éviter un crop
  // trop agressif au moment de l'affichage (background-size: cover) sur une carte large et basse
  let sx = 0, sy = 0, sWidth = bitmap.width, sHeight = bitmap.height
  if (aspectRatio) {
    const sourceRatio = bitmap.width / bitmap.height
    if (sourceRatio > aspectRatio) {
      sWidth = Math.round(bitmap.height * aspectRatio)
      sx = Math.round((bitmap.width - sWidth) / 2)
    } else {
      sHeight = Math.round(bitmap.width / aspectRatio)
      sy = Math.round((bitmap.height - sHeight) / 2)
    }
  }

  const scale = Math.min(1, maxDimension / Math.max(sWidth, sHeight))
  const width = Math.round(sWidth * scale)
  const height = Math.round(sHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Impossible de traiter cette image.')
  ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, width, height)

  let quality = startQuality
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > maxBytes && quality > 0.35) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrl.length > maxBytes) {
    throw new Error('Image trop volumineuse même après compression — essaie une photo plus simple.')
  }
  return dataUrl
}
