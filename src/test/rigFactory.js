import * as THREE from 'three'

// ── 합성 스켈레톤 팩토리 ──────────────────────────────────────────────
// 실제 FBX 없이 three 순수 객체(Bone/Group/QuaternionKeyframeTrack)로 리그를 만든다.
// 본 이름은 FBXLoader/GLTFLoader 가 sanitize 한 뒤의 형태('.'·':' 제거)를 쓴다.

// [이름, 부모] — 믹사모 표준 휴머노이드 22본
export const MIXAMO_BONES = [
  ['Hips', null], ['Spine', 'Hips'], ['Spine1', 'Spine'], ['Spine2', 'Spine1'],
  ['Neck', 'Spine2'], ['Head', 'Neck'],
  ['LeftShoulder', 'Spine2'], ['LeftArm', 'LeftShoulder'], ['LeftForeArm', 'LeftArm'], ['LeftHand', 'LeftForeArm'],
  ['RightShoulder', 'Spine2'], ['RightArm', 'RightShoulder'], ['RightForeArm', 'RightArm'], ['RightHand', 'RightForeArm'],
  ['LeftUpLeg', 'Hips'], ['LeftLeg', 'LeftUpLeg'], ['LeftFoot', 'LeftLeg'], ['LeftToeBase', 'LeftFoot'],
  ['RightUpLeg', 'Hips'], ['RightLeg', 'RightUpLeg'], ['RightFoot', 'RightLeg'], ['RightToeBase', 'RightFoot'],
]

// 블렌더(Rigify metarig) 휴머노이드 — hips 가 없고 spine 이 루트. 'spine.001' → 'spine001', 'upper_arm.L' → 'upper_armL'
export const BLENDER_BONES = [
  ['spine', null], ['spine001', 'spine'], ['spine002', 'spine001'], ['spine003', 'spine002'],
  ['spine004', 'spine003'], ['spine005', 'spine004'],
  ['shoulderL', 'spine003'], ['upper_armL', 'shoulderL'], ['forearmL', 'upper_armL'], ['handL', 'forearmL'],
  ['shoulderR', 'spine003'], ['upper_armR', 'shoulderR'], ['forearmR', 'upper_armR'], ['handR', 'forearmR'],
  ['thighL', 'spine'], ['shinL', 'thighL'], ['footL', 'shinL'], ['toeL', 'footL'],
  ['thighR', 'spine'], ['shinR', 'thighR'], ['footR', 'shinR'], ['toeR', 'footR'],
]

// 믹사모 본 ↔ 블렌더 본 대응(테스트 기대값 계산용)
export const MIXAMO_TO_BLENDER = Object.fromEntries(
  MIXAMO_BONES.map(([m], i) => [m, BLENDER_BONES[i][0]]),
)

/**
 * @param {Array<[string, string|null]>} spec
 * @param {{ prefix?: string, rootName?: string, rootQuat?: THREE.Quaternion, rest?: Record<string, THREE.Quaternion> }} opts
 * @returns {{ root: THREE.Group, bone: (name: string) => THREE.Bone }}
 */
export function buildRig(spec, { prefix = '', rootName = 'Armature', rootQuat, rest = {} } = {}) {
  const root = new THREE.Group()
  root.name = rootName
  if (rootQuat) root.quaternion.copy(rootQuat)
  const byName = new Map()
  for (const [name, parent] of spec) {
    const b = new THREE.Bone()
    b.name = prefix + name
    b.position.set(0, 0.1, 0)
    if (rest[name]) b.quaternion.copy(rest[name])
    byName.set(name, b)
    ;(parent ? byName.get(parent) : root).add(b)
  }
  root.updateMatrixWorld(true)
  return { root, bone: (n) => byName.get(n) }
}

export const qAxis = (x, y, z, deg) =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), THREE.MathUtils.degToRad(deg))

// 본마다 서로 다른 회전(식별용) — i 번째 본은 X축 (i+1)*3도
export const distinctRot = (i) => qAxis(1, 0, 0, (i + 1) * 3)

/**
 * 2키프레임 회전 클립. t=0 은 rest, t=1 은 rotations[name] (없으면 distinctRot).
 * @param {string[]} names  트랙을 만들 노드 이름(접두 포함 실제 이름)
 */
export function makeClip(names, { rotations = {}, rests = {}, positions = {}, name = 'mixamo.com' } = {}) {
  const tracks = names.map((n, i) => {
    const r0 = rests[n] ?? new THREE.Quaternion()
    const r1 = rotations[n] ?? r0.clone().multiply(distinctRot(i))
    return new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [...r0.toArray(), ...r1.toArray()])
  })
  for (const [n, [a, b]] of Object.entries(positions)) {
    tracks.push(new THREE.VectorKeyframeTrack(`${n}.position`, [0, 1], [...a, ...b]))
  }
  return new THREE.AnimationClip(name, 1, tracks)
}

export const track = (clip, name) => clip?.tracks.find(t => t.name === name)
export const lastQuat = (t) => new THREE.Quaternion().fromArray(t.values, t.values.length - 4)
export const angleDeg = (q) => THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(q.w))))
