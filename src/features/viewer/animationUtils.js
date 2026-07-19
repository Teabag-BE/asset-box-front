import * as THREE from 'three'

// ── 스켈레탈 애니메이션 유틸 ─────────────────────────────────────────────
// 1) 모델에 내장된 클립 재생은 AnimationMixer 로 그대로.
// 2) 클립이 없는 캐릭터라도 휴머노이드 본 구조(믹사모/블렌더 리그)면, 번들 기본 모션
//    (idle/walk/run)을 리타게팅해 입힌다.
//    방식: "로컬 델타 + 본 축(basis) 보정" —
//      delta = qsRest⁻¹ · qs(t)               (소스 본의 rest 대비 회전 변화량)
//      qt(t) = qtRest · C⁻¹ · delta · C       (C = 소스↔타깃 본 로컬축 변환, rest 월드 회전으로 산출)
//    회전 트랙만 이식(위치는 단위계 차이로 위험). 동일 리그면 C≈항등이라 원래 동작과 같다.
//    (SkeletonUtils.retargetClip 은 이 FBX 루트 변환 케이스에서 팔이 뒤집혀 채택하지 않음 —
//     세 방식을 본 월드좌표 수치 비교로 검증해 이 방식을 채택함)

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

// 역방향: 블렌더 리그 키 → 믹사모 표준 키.
// 믹사모에 자기 캐릭터(블렌더 리그)를 업로드해 받은 애니메이션 FBX 는 소스 본 이름이
// mixamorig 가 아니라 캐릭터 원래 이름(spine, spine001, thighl…)이라 이 역매핑이 필요하다.
const MIXAMO_FROM_BLENDER = Object.fromEntries(
  Object.entries(BLENDER_ALIASES).map(([mixamo, blender]) => [blender, mixamo])
)

// 이 리그가 블렌더(Rigify류) 이름 체계인가 — hips 없이 spine+spine001 이 척추 체인.
function isBlenderStyleRig(keys) {
  return !keys.has('hips') && keys.has('spine') && keys.has('spine001') && (keys.has('thighl') || keys.has('thighr'))
}

// 리타게팅 가능한 휴머노이드인가 — 믹사모 표준(hips+spine) 또는 블렌더 리그면 시도.
export function isRetargetableHumanoid(root) {
  const keys = new Set(collectBones(root).map(b => normalizeBoneKey(b.name)))
  return (keys.has('hips') && (keys.has('spine') || keys.has('spine1'))) || isBlenderStyleRig(keys)
}

// 팔 델타 감쇠 — 체형(어깨폭·rest 각도) 차이로 소스의 팔 회전을 100% 이식하면
// 팔이 몸에 파고든다. 위팔/어깨 델타를 일부만 적용해 T포즈와 목표 포즈 사이의
// 자연스러운 지점에 멈추게 한다(1=전부 적용, 0=rest 유지).
const DELTA_KEEP = {
  leftarm: 0.8,       rightarm: 0.8,       // 위팔
  leftshoulder: 0.9,  rightshoulder: 0.9,  // 어깨(쇄골)
}

/**
 * 믹사모 계열 클립을 target 스켈레톤으로 리타게팅(로컬 델타 + basis 보정).
 * @returns {THREE.AnimationClip|null} 유효 트랙이 없으면 null
 */
export function retargetMixamoClip(clip, sourceRoot, targetRoot) {
  try {
    // rest 월드 회전(C 산출)에 최신 월드행렬 필요.
    sourceRoot?.updateMatrixWorld?.(true)
    targetRoot?.updateMatrixWorld?.(true)

    const sourceByKey = new Map()
    for (const b of collectBones(sourceRoot)) {
      const k = normalizeBoneKey(b.name)
      if (!sourceByKey.has(k)) sourceByKey.set(k, b)
    }
    // 소스가 블렌더 리그(믹사모에 자기 캐릭터 업로드 후 받은 FBX)여도 허용.
    const srcBlender = isBlenderStyleRig(new Set(sourceByKey.keys()))
    if (!sourceByKey.has('hips') && !srcBlender) return null

    const targetByKey = new Map()
    for (const b of collectBones(targetRoot)) {
      const k = normalizeBoneKey(b.name)
      if (!targetByKey.has(k)) targetByKey.set(k, b)
    }
    // 블렌더 리그면 별칭이 우선 — 'spine'을 믹사모 spine 에 직접 매칭시키면
    // hips 매핑이 사라지고 척추 체인이 한 칸씩 밀린다(spine→hips 가 정답).
    const blender = isBlenderStyleRig(new Set(targetByKey.keys()))
    const resolveTarget = (key) => blender
      ? (targetByKey.get(BLENDER_ALIASES[key] ?? '') ?? targetByKey.get(key))
      : targetByKey.get(key)
    if (!resolveTarget('hips')) return null

    const qs = new THREE.Quaternion()
    const delta = new THREE.Quaternion()
    const tmp = new THREE.Quaternion()
    const wS = new THREE.Quaternion()
    const wT = new THREE.Quaternion()
    const IDENTITY = new THREE.Quaternion()

    const tracks = []
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.')
      if (dot < 0) continue
      const nodeName = track.name.slice(0, dot)
      const prop = track.name.slice(dot + 1)
      if (prop !== 'quaternion') continue  // 위치/스케일 트랙은 단위계·체형 차이로 위험 → 회전만
      const key = normalizeBoneKey(nodeName)
      // 블렌더 리그 소스면 믹사모 표준 키로 환산해 타깃을 찾는다(동일 리그면 이름 그대로도 매칭).
      const canon = srcBlender ? (MIXAMO_FROM_BLENDER[key] ?? key) : key
      const src = sourceByKey.get(key)
      const target = resolveTarget(canon) ?? targetByKey.get(key)
      if (!src || !target) continue

      const t = track.clone()
      t.values = track.values.slice()  // clone() 은 values 를 참조 공유하므로 원본 보호
      t.name = `${target.name}.quaternion`

      const qsRestInv = src.quaternion.clone().invert()
      const qtRest = target.quaternion.clone()
      // C: 타깃 본 로컬축 → 소스 본 로컬축 (rest 월드 회전 기준)
      src.getWorldQuaternion(wS)
      target.getWorldQuaternion(wT)
      const C = wS.clone().invert().multiply(wT)
      const Cinv = C.clone().invert()

      // 같은 본 이름 = 같은 리그(자기 캐릭터로 받은 모션) → 감쇠 없이 원본 그대로.
      const keep = src.name === target.name ? 1 : (DELTA_KEEP[canon] ?? 1)
      const v = t.values
      for (let i = 0; i + 3 < v.length; i += 4) {
        qs.set(v[i], v[i + 1], v[i + 2], v[i + 3])
        delta.copy(qsRestInv).multiply(qs)              // 소스 로컬 delta
        if (keep < 1) delta.slerp(IDENTITY, 1 - keep)   // 팔/어깨는 델타 일부만(파고듦 방지)
        tmp.copy(Cinv).multiply(delta).multiply(C)      // 타깃 로컬축으로 변환(delta 와 다른 인스턴스 사용)
        tmp.premultiply(qtRest)                         // qtRest · (보정된 delta)
        v[i] = tmp.x; v[i + 1] = tmp.y; v[i + 2] = tmp.z; v[i + 3] = tmp.w
      }
      tracks.push(t)
    }
    if (tracks.length < 8) return null  // 팔다리도 못 잡으면 포기
    return new THREE.AnimationClip(clip.name || 'motion', clip.duration, tracks)
  } catch (e) {
    console.warn('[animationUtils] retargetMixamoClip 실패:', e)
    return null
  }
}
