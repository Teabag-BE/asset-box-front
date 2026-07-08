// 이미지(File/Blob)를 지정 픽셀 이내로 축소한 JPEG dataURL 로 변환한다.
// AI 비전 추천에 보낼 썸네일 용도 — 512px면 인식엔 충분하고 페이로드/비용을 크게 줄인다.
// 실패하면 던지지 않고 null 을 반환한다(추천은 텍스트만으로도 동작).
export async function downscaleToDataUrl(source, max = 512, quality = 0.8) {
  try {
    if (!source) return null
    const bitmap = await createImageBitmap(source)
    const longest = Math.max(bitmap.width, bitmap.height) || 1
    const scale = Math.min(1, max / longest)
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    // 투명 PNG → JPEG 변환 시 배경이 검게 나오지 않도록 흰색으로 채운다.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
}
