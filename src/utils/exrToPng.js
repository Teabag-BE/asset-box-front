import * as THREE from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'

// EXR(HDR float) 텍스처를 8-bit PNG 바이트로 변환한다.
// 백엔드 허용 확장자(png/jpg)가 아니고 뷰어 FBXLoader 도 exr 을 못 읽으므로, 업로드 시 변환한다.
// metal/rough/normal 같은 데이터 맵은 0..1 범위라 8-bit 변환 손실이 거의 없다.
export async function exrToPngBytes(arrayBuffer) {
  const tex = new EXRLoader().parse(arrayBuffer)
  const { width, height, data } = tex
  const channels = data.length / (width * height)
  const isHalf = data.constructor === Uint16Array
  const read = isHalf ? (i) => THREE.DataUtils.fromHalfFloat(data[i]) : (i) => data[i]
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)))

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(width, height)
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels
    const d = p * 4
    img.data[d] = to255(read(s))
    img.data[d + 1] = channels > 1 ? to255(read(s + 1)) : img.data[d]
    img.data[d + 2] = channels > 2 ? to255(read(s + 2)) : img.data[d]
    img.data[d + 3] = channels > 3 ? to255(read(s + 3)) : 255
  }
  ctx.putImageData(img, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}
