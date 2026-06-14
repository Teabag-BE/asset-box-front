import { request, requestMultipart } from './client'

// presigned URL(쿼리스트링 포함)에서 확장자만 뽑기:  .../foo/bar.glb?X-Amz-...  → "glb"
export function extFromUrl(url) {
  try {
    const path = new URL(url).pathname
    const dot = path.lastIndexOf('.')
    return dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
  } catch {
    return ''
  }
}

const VIEWABLE = ['glb', 'gltf', 'fbx', 'obj']

export const fileApi = {
  // 모델/텍스처 등 에셋 파일 업로드 (post 생성 후 postId 로 연결)
  //  files: File[],  uploaderId: 현재 유저 id
  uploadAssetFiles: (files, { purposeId, uploaderId, fileType = 'MODEL' }) => {
    const fd = new FormData()
    const batchId = crypto.randomUUID()
    const fileInfos = files.map((_, i) => ({
      purpose: 'ASSET',
      purposeId,
      fileType,
      uploadBatchId: batchId,
      sortOrder: i + 1,
      uploadedBy: uploaderId,
    }))
    files.forEach(f => fd.append('files', f))
    fd.append('infos', new Blob([JSON.stringify({ fileInfos })], { type: 'application/json' }))
    return requestMultipart('/files/upload', fd)
  },

  // 특정 post(ASSET)의 파일 presigned URL 목록
  getAssetUrls: (postId) =>
    request(`/files/get/presigned-urls?filePurpose=ASSET&filePurposeId=${postId}`),

  // URL 목록에서 3D 로 볼 수 있는 첫 모델 파일 골라 {url, ext} 반환
  pickModel: (urls = []) => {
    for (const url of urls) {
      const ext = extFromUrl(url)
      if (VIEWABLE.includes(ext)) return { url, ext }
    }
    return null
  },
}
