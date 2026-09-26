import { describe, it, expect, vi, beforeEach } from 'vitest'
import { zipSync, unzipSync, strToU8 } from 'fflate'

// 배포 직후처럼 EXR 변환 청크(동적 import)를 못 받을 때, .exr 원본을 몰래 올리지 않고
// (백엔드가 등록 전체를 '허용되지 않은 확장자'로 거부) 새로고침 안내로 멈춰야 한다(#177 리뷰).
const zipFile = (entries) => new File([zipSync(entries)], 'asset.zip', { type: 'application/zip' })

beforeEach(() => { vi.resetModules() })

describe('toAssetZipFile — EXR 변환 모듈', () => {
  it('모듈 로드 실패 → 원본 .exr 업로드 대신 새로고침 안내로 실패', async () => {
    vi.doMock('./exrToPng', () => { throw new TypeError('Failed to fetch dynamically imported module: /assets/exrToPng-old.js') })
    const { toAssetZipFile } = await import('./assetZip')
    const file = zipFile({ 'model.glb': strToU8('glTF'), 'tex/base.exr': strToU8('exr-bytes') })
    await expect(toAssetZipFile(file)).rejects.toThrow('새로고침 후 다시 등록')
  })

  it('모듈은 받았는데 변환 자체가 실패하면 기존대로 원본 유지(경고)', async () => {
    vi.doMock('./exrToPng', () => ({ exrToPngBytes: async () => { throw new Error('bad exr') } }))
    const { toAssetZipFile } = await import('./assetZip')
    const out = await toAssetZipFile(zipFile({ 'model.glb': strToU8('glTF'), 'tex/base.exr': strToU8('exr-bytes') }))
    const names = Object.keys(unzipSync(new Uint8Array(await out.arrayBuffer())))
    expect(names).toContain('tex/base.exr')
  })

  it('변환 성공 → .exr 가 같은 경로의 .png 로 바뀐다', async () => {
    vi.doMock('./exrToPng', () => ({ exrToPngBytes: async () => new Uint8Array([137, 80, 78, 71]) }))
    const { toAssetZipFile } = await import('./assetZip')
    const out = await toAssetZipFile(zipFile({ 'model.glb': strToU8('glTF'), 'tex/base.exr': strToU8('exr-bytes') }))
    const names = Object.keys(unzipSync(new Uint8Array(await out.arrayBuffer())))
    expect(names).toContain('tex/base.png')
    expect(names).not.toContain('tex/base.exr')
  })
})
