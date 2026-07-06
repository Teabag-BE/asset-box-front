import { unzipSync, zipSync } from 'fflate'
import { exrToPngBytes } from './exrToPng'
import { CONVERTIBLE_TEXTURE_EXTS, extOf, isJunkEntry, isKeptForUpload } from './assetFormats'

const MODEL_EXTENSIONS = new Set(['fbx', 'glb'])

// 일부 툴이 만든 ZIP 은 STORED 엔트리에 데이터 디스크립터(EXT)를 붙여,
// 백엔드의 Java ZipInputStream 이 거부한다("only DEFLATED entries can have EXT descriptor").
// 브라우저에서 표준 ZIP 으로 재압축해 호환성을 보장하고, __MACOSX·디렉토리 엔트리도 정리한다.
// 또한 백엔드가 안 받고 뷰어도 못 읽는 .exr 텍스처는 .png 로 변환한다.
// 문서(.txt/.html …)·미지원 텍스처(.tga/.dds …)처럼 백엔드가 거부하는 파일은
// 여기서 조용히 빼고 올린다. (사전검사 validateAssetPackage 가 사용자에게 미리 안내함)
async function normalizeZip(file, bytes) {
  const entries = unzipSync(bytes)
  const clean = {}
  for (const [path, data] of Object.entries(entries)) {
    if (isJunkEntry(path)) continue

    if (CONVERTIBLE_TEXTURE_EXTS.has(extOf(path))) {
      try {
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        clean[path.replace(/\.[^.]+$/i, '.png')] = await exrToPngBytes(buf)
        continue
      } catch (e) {
        // 변환 실패 시 원본 유지(백엔드가 거부할 수 있으나, 조용히 삼키지 않음)
        console.warn('[assetZip] EXR→PNG 변환 실패, 원본 유지:', path, e)
        clean[path] = data
        continue
      }
    }

    if (!isKeptForUpload(path)) continue // 문서·미지원 포맷은 업로드에서 제외
    clean[path] = data
  }
  const rezipped = zipSync(clean)
  return new File([rezipped], file.name, { type: 'application/zip', lastModified: Date.now() })
}

function extensionOf(filename = '') {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

function baseNameOf(filename = 'asset') {
  const normalized = filename.replace(/\\/g, '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1) || 'asset'
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980)
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = (year - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function header(size) {
  const bytes = new Uint8Array(size)
  return { bytes, view: new DataView(bytes.buffer) }
}

export async function toAssetZipFile(file) {
  const ext = extensionOf(file?.name)
  if (ext === 'zip') {
    return normalizeZip(file, new Uint8Array(await file.arrayBuffer()))
  }
  if (!MODEL_EXTENSIONS.has(ext)) {
    throw new Error('GLB, FBX 또는 ZIP 파일만 업로드할 수 있습니다.')
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer())
  const nameBytes = new TextEncoder().encode(file.name)
  const crc = crc32(fileBytes)
  const { time, day } = dosDateTime(file.lastModified ? new Date(file.lastModified) : new Date())
  const flagUtf8 = 0x0800
  const methodStore = 0

  const local = header(30 + nameBytes.length)
  local.view.setUint32(0, 0x04034b50, true)
  local.view.setUint16(4, 20, true)
  local.view.setUint16(6, flagUtf8, true)
  local.view.setUint16(8, methodStore, true)
  local.view.setUint16(10, time, true)
  local.view.setUint16(12, day, true)
  local.view.setUint32(14, crc, true)
  local.view.setUint32(18, fileBytes.length, true)
  local.view.setUint32(22, fileBytes.length, true)
  local.view.setUint16(26, nameBytes.length, true)
  local.bytes.set(nameBytes, 30)

  const centralOffset = local.bytes.length + fileBytes.length
  const central = header(46 + nameBytes.length)
  central.view.setUint32(0, 0x02014b50, true)
  central.view.setUint16(4, 20, true)
  central.view.setUint16(6, 20, true)
  central.view.setUint16(8, flagUtf8, true)
  central.view.setUint16(10, methodStore, true)
  central.view.setUint16(12, time, true)
  central.view.setUint16(14, day, true)
  central.view.setUint32(16, crc, true)
  central.view.setUint32(20, fileBytes.length, true)
  central.view.setUint32(24, fileBytes.length, true)
  central.view.setUint16(28, nameBytes.length, true)
  central.view.setUint32(42, 0, true)
  central.bytes.set(nameBytes, 46)

  const end = header(22)
  end.view.setUint32(0, 0x06054b50, true)
  end.view.setUint16(8, 1, true)
  end.view.setUint16(10, 1, true)
  end.view.setUint32(12, central.bytes.length, true)
  end.view.setUint32(16, centralOffset, true)

  const blob = new Blob([local.bytes, fileBytes, central.bytes, end.bytes], { type: 'application/zip' })
  return new File([blob], `${baseNameOf(file.name)}.zip`, { type: 'application/zip', lastModified: Date.now() })
}
