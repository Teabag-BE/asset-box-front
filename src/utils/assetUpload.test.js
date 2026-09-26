import { describe, it, expect, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import {
  extOf, isJunkEntry, isKeptForUpload,
  MODEL_EXTS, MODEL_AUX_EXTS, KEPT_TEXTURE_EXTS,
} from './assetFormats'
import { validateAssetPackage } from './validateAssetPackage'

// 가짜 FBX 바이트: 바이너리 FBX 처럼 문자열 앞뒤가 NUL 로 끊기게
const fakeFbx = (...texRefs) => strToU8(
  'Kaydara FBX Binary  \0\0\0\0Model\0\0\0' + texRefs.map(r => `\0\0\0\0${r}\0`).join('') + '\0\0end',
)
const zipFile = (entries, name = 'asset.zip') => new File([zipSync(entries)], name)

describe('assetFormats', () => {
  it.each([
    ['Model.FBX', 'fbx'], ['dir\\sub\\a.PNG', 'png'], ['a.tar.gz', 'gz'], ['.hidden', ''], ['noext', ''],
  ])('extOf(%s) = %s', (p, e) => expect(extOf(p)).toBe(e))

  it.each([
    ['__MACOSX/._model.fbx', true], ['textures/._a.png', true], ['.DS_Store', true],
    ['sub/Thumbs.db', true], ['dir/', true], ['model.fbx', false],
  ])('isJunkEntry(%s) = %s', (p, j) => expect(isJunkEntry(p)).toBe(j))
})

// be-main src/main/java/io/teabag/assetbox/file/service/ZipExtractService.java:24
//   ALLOWED_EXTENSIONS = Set.of("fbx", "glb", "png", "jpg", "jpeg", "txt")  (be-dev 도 동일)
// 백엔드 계약이 바뀌면 이 스냅샷을 같은 PR 에서 갱신한다.
const BACKEND_ZIP_ALLOWED = new Set(['fbx', 'glb', 'png', 'jpg', 'jpeg', 'txt'])

describe('계약: 업로드 zip 에 남기는 확장자 ⊆ 백엔드 ZipExtractService 허용 확장자', () => {
  it('지원 텍스처(png/jpg/jpeg)와 fbx/glb 는 백엔드가 받는다', () => {
    for (const e of ['fbx', 'glb', ...KEPT_TEXTURE_EXTS]) {
      expect(isKeptForUpload(`a.${e}`)).toBe(true)
      expect(BACKEND_ZIP_ALLOWED.has(e), e).toBe(true)
    }
  })
  // 발견: .gltf/.bin 은 프론트가 zip 에 남기지만 백엔드가 EXTENSIONS_INVALID("허용되지 않은 확장자입니다.") 로 거부.
  it.fails('gltf/bin 도 백엔드가 받아야 한다(현재 불일치)', () => {
    const kept = [...MODEL_EXTS, ...MODEL_AUX_EXTS].filter(e => isKeptForUpload(`a.${e}`))
    expect(kept.filter(e => !BACKEND_ZIP_ALLOWED.has(e))).toEqual([])
  })
})

describe('validateAssetPackage — 업로드 사전검증', () => {
  it('macOS Finder 압축(__MACOSX/._model.fbx)을 "모델 2개"로 막지 않는다', async () => {
    const r = await validateAssetPackage(zipFile({
      'model.fbx': fakeFbx(), '__MACOSX/._model.fbx': strToU8('junk'),
    }))
    expect(r).toEqual({ ok: true })
  })
  it('모델이 2개면 차단', async () => {
    const r = await validateAssetPackage(zipFile({ 'a.fbx': fakeFbx(), 'b.glb': new Uint8Array(4) }))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('3D 모델이 2개')
  })
  it('모델이 없으면 차단 + 지원 형식 안내', async () => {
    const r = await validateAssetPackage(zipFile({ 'readme.txt': strToU8('hi'), 'a.png': new Uint8Array(4) }))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('AssetBox 지원 형식')
  })
  it('해상도 접미사·폴더 경로가 달라도 텍스처 매칭(경고 없음)', async () => {
    const r = await validateAssetPackage(zipFile({
      'model.fbx': fakeFbx('C:\\Users\\ta\\tex\\Body_diff_2k.png'),
      'textures/body_diff.png': new Uint8Array(4),
    }))
    expect(r).toEqual({ ok: true })
  })
  it('jpg ↔ jpeg 확장자 차이는 같은 텍스처로 본다', async () => {
    const r = await validateAssetPackage(zipFile({ 'm.fbx': fakeFbx('Skin.jpg'), 'skin.jpeg': new Uint8Array(4) }))
    expect(r).toEqual({ ok: true })
  })
  it('참조 텍스처가 없어도 차단하지 않고 경고만', async () => {
    const r = await validateAssetPackage(zipFile({ 'm.fbx': fakeFbx('Cola_Label.png'), 'other.png': new Uint8Array(4) }))
    expect(r.ok).toBe(true)
    expect(r.warning).toContain('cola_label.png')
  })
  it('내장 텍스처(PNG 매직바이트)면 참조 검사 생략', async () => {
    const bytes = new Uint8Array([...fakeFbx('missing.png'), 0x89, 0x50, 0x4e, 0x47])
    expect(await validateAssetPackage(zipFile({ 'm.fbx': bytes }))).toEqual({ ok: true })
  })
  it('미지원 텍스처·문서는 자동 제외 안내를 경고에 붙인다', async () => {
    const r = await validateAssetPackage(zipFile({
      'm.fbx': fakeFbx(), 'a.tga': new Uint8Array(4), 'license.txt': strToU8('x'),
    }))
    expect(r.ok).toBe(true)
    expect(r.warning).toContain('a.tga')
    expect(r.warning).toContain('license.txt')
  })
  it('깨진 zip 은 오차단하지 않는다(fail-open)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await validateAssetPackage(new File([strToU8('not a zip')], 'x.zip'))).toEqual({ ok: true })
    expect(warn).toHaveBeenCalled()
  })
  it('현재 동작 기록: glTF zip(scene.gltf+scene.bin)은 사전검증을 통과한다 → 백엔드에서 거부됨', async () => {
    const r = await validateAssetPackage(zipFile({
      'scene.gltf': strToU8('{}'), 'scene.bin': new Uint8Array(8), 'textures/base.png': new Uint8Array(4),
    }))
    expect(r).toEqual({ ok: true })
    expect(isKeptForUpload('scene.gltf') && isKeptForUpload('scene.bin')).toBe(true)
  })
})
