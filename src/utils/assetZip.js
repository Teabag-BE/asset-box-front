const MODEL_EXTENSIONS = new Set(['fbx', 'glb'])

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
  if (ext === 'zip') return file
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
