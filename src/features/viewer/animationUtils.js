import * as THREE from 'three'

// ── 스켈레탈 애니메이션 유틸 ─────────────────────────────────────────────
// 1) 모델에 내장된 클립 재생은 AnimationMixer 로 그대로.
// 2) 클립이 없는 캐릭터라도 믹사모 계열 휴머노이드 본 구조면, 번들된 기본 모션
//    (idle/walk/run)을 "본 이름 매칭"으로 리타게팅해 입힌다.
//    - 회전 트랙만 옮기고(로컬 회전은 체형이 달라도 안전), 위치 트랙은 hips 만
//      체형 비율로 스케일해 유지한다(발이 뜨거나 꺼지는 것 방지).

// 본 이름 정규화: 대소문자/구분자/mixamorig 접두 제거.
// 예: "mixamorig:Hips" / "mixamorigHips" / "Hips" → "hips"
export function normalizeBoneKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^mixamorig/, '')
}

export function collectBones(root) {
  const bones = []
  try {
    root?.traverse?.(o => { if (o.isBone) bones.push(o) })
  } catch { /* 무시 */ }
  return bones
}

// 리타게팅 가능한 휴머노이드인가 — hips + spine 본이 있으면 시도할 가치가 있다.
export function isRetargetableHumanoid(root) {
  const keys = new Set(collectBones(root).map(b => normalizeBoneKey(b.name)))
  return keys.has('hips') && (keys.has('spine') || keys.has('spine1'))
}

/**
 * 믹사모 계열 클립을 target 스켈레톤으로 리타게팅.
 * 본 이름을 정규화 키로 매칭해 트랙을 개명한다. 매칭 안 되는 트랙은 버림.
 * @returns {THREE.AnimationClip|null} 유효 트랙이 없으면 null
 */
export function retargetMixamoClip(clip, sourceRoot, targetRoot) {
  try {
    const targetByKey = new Map()
    for (const b of collectBones(targetRoot)) {
      const k = normalizeBoneKey(b.name)
      if (!targetByKey.has(k)) targetByKey.set(k, b)
    }
    const tgtHips = targetByKey.get('hips')
    if (!tgtHips) return null

    const srcHips = collectBones(sourceRoot).find(b => normalizeBoneKey(b.name) === 'hips')
    // 체형(키) 비율 — hips 의 rest 높이 비. 산정 불가하면 1(스케일 안 함).
    const scale = (srcHips && Math.abs(srcHips.position.y) > 1e-6 && Math.abs(tgtHips.position.y) > 1e-6)
      ? Math.abs(tgtHips.position.y) / Math.abs(srcHips.position.y)
      : 1

    const tracks = []
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.')
      if (dot < 0) continue
      const nodeName = track.name.slice(0, dot)
      const prop = track.name.slice(dot + 1)
      const key = normalizeBoneKey(nodeName)
      const target = targetByKey.get(key)
      if (!target) continue

      if (prop === 'quaternion') {
        const t = track.clone()
        t.name = `${target.name}.quaternion`
        tracks.push(t)
      } else if (prop === 'position' && key === 'hips') {
        const t = track.clone()
        t.name = `${target.name}.position`
        for (let i = 0; i < t.values.length; i++) t.values[i] *= scale
        tracks.push(t)
      }
      // 그 외 position/scale 트랙은 체형 왜곡을 만들므로 버린다.
    }
    if (tracks.length === 0) return null
    return new THREE.AnimationClip(clip.name || 'motion', clip.duration, tracks)
  } catch (e) {
    console.warn('[animationUtils] retargetMixamoClip 실패:', e)
    return null
  }
}
