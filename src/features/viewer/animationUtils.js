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

// 믹사모 표준 키 → 블렌더(Rigify류) 리그 키 별칭.
// 블렌더 휴머노이드는 hips 가 없고 spine 이 루트, spine.001~005 가 척추~머리로 이어진다.
// (FBXLoader 가 '.'과 ':' 를 제거하므로 정규화 키 기준으로 매핑)
const BLENDER_ALIASES = {
  hips: 'spine',
  spine: 'spine001',
  spine1: 'spine002',
  spine2: 'spine003',
  neck: 'spine004',
  head: 'spine005',
  leftshoulder: 'shoulderl',  rightshoulder: 'shoulderr',
  leftarm: 'upperarml',       rightarm: 'upperarmr',
  leftforearm: 'forearml',    rightforearm: 'forearmr',
  lefthand: 'handl',          righthand: 'handr',
  leftupleg: 'thighl',        rightupleg: 'thighr',
  leftleg: 'shinl',           rightleg: 'shinr',
  leftfoot: 'footl',          rightfoot: 'footr',
  lefttoebase: 'toel',        righttoebase: 'toer',
}

// 이 리그가 블렌더(Rigify류) 이름 체계인가 — hips 없이 spine+spine001 이 척추 체인.
function isBlenderStyleRig(keys) {
  return !keys.has('hips') && keys.has('spine') && keys.has('spine001') && (keys.has('thighl') || keys.has('thighr'))
}

// 리타게팅 가능한 휴머노이드인가 — 믹사모 표준(hips+spine) 또는 블렌더 리그면 시도.
export function isRetargetableHumanoid(root) {
  const keys = new Set(collectBones(root).map(b => normalizeBoneKey(b.name)))
  return (keys.has('hips') && (keys.has('spine') || keys.has('spine1'))) || isBlenderStyleRig(keys)
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
    // 블렌더 리그면 믹사모 키 → 블렌더 키 별칭으로 한 번 더 찾아본다.
    const blender = isBlenderStyleRig(new Set(targetByKey.keys()))
    const resolveTarget = (key) => targetByKey.get(key)
      ?? (blender && BLENDER_ALIASES[key] ? targetByKey.get(BLENDER_ALIASES[key]) : undefined)

    const tgtHips = resolveTarget('hips')
    if (!tgtHips) return null

    const sourceByKey = new Map()
    for (const b of collectBones(sourceRoot)) {
      const k = normalizeBoneKey(b.name)
      if (!sourceByKey.has(k)) sourceByKey.set(k, b)
    }
    const srcHips = sourceByKey.get('hips')
    // 체형(키) 비율 — hips 의 rest 높이 비. 산정 불가하면 1(스케일 안 함).
    const scale = (srcHips && Math.abs(srcHips.position.y) > 1e-6 && Math.abs(tgtHips.position.y) > 1e-6)
      ? Math.abs(tgtHips.position.y) / Math.abs(srcHips.position.y)
      : 1

    // rest-pose 보정용 임시 쿼터니언 (트랙 키프레임마다 재사용)
    const qs = new THREE.Quaternion()
    const qsRestInv = new THREE.Quaternion()
    const qtRest = new THREE.Quaternion()
    const out = new THREE.Quaternion()

    const tracks = []
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.')
      if (dot < 0) continue
      const nodeName = track.name.slice(0, dot)
      const prop = track.name.slice(dot + 1)
      const key = normalizeBoneKey(nodeName)
      const target = resolveTarget(key)
      if (!target) continue

      if (prop === 'quaternion') {
        const t = track.clone()
        t.name = `${target.name}.quaternion`
        // 본 로컬 축이 리그마다 달라 회전을 그대로 복사하면 팔다리가 꼬인다.
        // rest 대비 변화량만 이식: qt(t) = qtRest · qsRest⁻¹ · qs(t)
        const src = sourceByKey.get(key)
        if (src && target.quaternion) {
          qsRestInv.copy(src.quaternion).invert()
          qtRest.copy(target.quaternion)
          const v = t.values
          for (let i = 0; i + 3 < v.length; i += 4) {
            qs.set(v[i], v[i + 1], v[i + 2], v[i + 3])
            out.copy(qtRest).multiply(qsRestInv).multiply(qs)
            v[i] = out.x; v[i + 1] = out.y; v[i + 2] = out.z; v[i + 3] = out.w
          }
        }
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
