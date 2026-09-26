import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  normalizeBoneKey,
  isRetargetableHumanoid,
  retargetMixamoClip,
  collectRigNodes,
} from './animationUtils'
import {
  MIXAMO_BONES, BLENDER_BONES, MIXAMO_TO_BLENDER,
  buildRig, makeClip, qAxis, distinctRot, track, lastQuat, angleDeg,
} from '../../test/rigFactory'

const MIX = 'mixamorig' // FBXLoader/GLTFLoader 가 'mixamorig:' 의 ':' 를 지운 형태
const mixNames = MIXAMO_BONES.map(([n]) => MIX + n)
const blNames = BLENDER_BONES.map(([n]) => n)

// q 와 -q 는 같은 회전 → |dot| 로 비교
function expectSameRotation(actual, expected, eps = 1e-5) {
  expect(Math.abs(actual.dot(expected))).toBeGreaterThan(1 - eps)
}

describe('normalizeBoneKey', () => {
  it.each([
    ['mixamorig:Hips', 'hips'],
    ['mixamorigHips', 'hips'],
    ['Hips', 'hips'],
    ['upper_arm.L', 'upperarml'],
    ['spine.001', 'spine001'],
  ])('%s → %s', (input, key) => {
    expect(normalizeBoneKey(input)).toBe(key)
  })
})

describe('isRetargetableHumanoid', () => {
  it('믹사모 리그(hips+spine)', () => {
    expect(isRetargetableHumanoid(buildRig(MIXAMO_BONES, { prefix: MIX }).root)).toBe(true)
  })
  it('블렌더 리그(hips 없음, spine 루트 + thigh)', () => {
    expect(isRetargetableHumanoid(buildRig(BLENDER_BONES, { rootName: 'metarig' }).root)).toBe(true)
  })
  it('휴머노이드가 아닌 본 체인은 거부', () => {
    const { root } = buildRig([['Bone', null], ['Bone001', 'Bone'], ['Bone002', 'Bone001']])
    expect(isRetargetableHumanoid(root)).toBe(false)
  })
})

describe('retargetMixamoClip — (a) 블렌더 타깃 별칭 우선순위', () => {
  it('hips→spine, spine→spine001 … 척추 체인이 한 칸도 밀리지 않는다', () => {
    const src = buildRig(MIXAMO_BONES, { prefix: MIX })
    const tgt = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    const clip = makeClip(mixNames)
    const out = retargetMixamoClip(clip, src.root, tgt.root)
    expect(out).not.toBeNull()

    // 같은 타깃 본에 트랙 2개가 꽂히면(= spine 이 hips 매핑을 훔침) 이름이 중복된다
    const names = out.tracks.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)

    // rest 가 모두 항등이면 C=I → 감쇠 없는 본은 소스 회전이 그대로 옮겨와야 한다
    for (const m of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'RightFoot']) {
      const b = MIXAMO_TO_BLENDER[m]
      const got = track(out, `${b}.quaternion`)
      expect(got, `${m} → ${b} 트랙`).toBeDefined()
      expectSameRotation(lastQuat(got), lastQuat(track(clip, `${MIX}${m}.quaternion`)))
    }
  })
})

describe('retargetMixamoClip — (b) 원본 클립 오염 방지', () => {
  it('리타게팅 후 원본 트랙 values 가 그대로이고, 결과와 버퍼를 공유하지 않는다', () => {
    const src = buildRig(MIXAMO_BONES, { prefix: MIX })
    // 타깃 rest 를 비항등으로 → 출력값이 입력값과 달라지게(오염이 있으면 드러나게)
    const rest = Object.fromEntries(BLENDER_BONES.map(([n], i) => [n, qAxis(0, 1, 0, 10 + i)]))
    const tgt = buildRig(BLENDER_BONES, { rootName: 'metarig', rest })
    const clip = makeClip(mixNames)
    const before = clip.tracks.map(t => Array.from(t.values))

    const out1 = retargetMixamoClip(clip, src.root, tgt.root)
    expect(clip.tracks.map(t => Array.from(t.values))).toEqual(before)
    for (const t of out1.tracks) {
      for (const s of clip.tracks) expect(t.values).not.toBe(s.values)
    }
    // 같은 클립을 두 번(연속 드롭/모션팩 재사용) 리타게팅해도 결과가 같아야 한다
    const out2 = retargetMixamoClip(clip, src.root, tgt.root)
    expect(out2.tracks.map(t => Array.from(t.values))).toEqual(out1.tracks.map(t => Array.from(t.values)))
  })
})

describe('retargetMixamoClip — (c) basis 보정(쿼터니언 곱 별칭 버그)', () => {
  it('rest·루트 회전이 달라도 모든 본의 "월드 회전 변화량"이 소스와 같다', () => {
    // 소스: FBX Z-up 처럼 루트가 X축 -90°, 본마다 제각각 rest. 타깃: 다른 rest. 이름은 같음(감쇠 없음)
    const srcRest = Object.fromEntries(MIXAMO_BONES.map(([n], i) => [n, qAxis(1, i % 3, 0.5, 10 + i * 7)]))
    const tgtRest = Object.fromEntries(MIXAMO_BONES.map(([n], i) => [n, qAxis(0.3, 1, i % 2, -20 - i * 5)]))
    const src = buildRig(MIXAMO_BONES, { prefix: MIX, rootQuat: qAxis(1, 0, 0, -90), rest: srcRest })
    const tgt = buildRig(MIXAMO_BONES, { prefix: MIX, rest: tgtRest })
    const rests = Object.fromEntries(MIXAMO_BONES.map(([n]) => [MIX + n, srcRest[n]]))
    const clip = makeClip(mixNames, { rests })

    const out = retargetMixamoClip(clip, src.root, tgt.root)
    expect(out).not.toBeNull()

    const worldRest = (rig) => new Map(MIXAMO_BONES.map(([n]) => [n, rig.bone(n).getWorldQuaternion(new THREE.Quaternion())]))
    const srcW0 = worldRest(src)
    const tgtW0 = worldRest(tgt)
    // t=1 포즈 적용
    for (const [n] of MIXAMO_BONES) {
      src.bone(n).quaternion.copy(lastQuat(track(clip, `${MIX}${n}.quaternion`)))
      tgt.bone(n).quaternion.copy(lastQuat(track(out, `${MIX}${n}.quaternion`)))
    }
    src.root.updateMatrixWorld(true)
    tgt.root.updateMatrixWorld(true)
    for (const [n] of MIXAMO_BONES) {
      const dS = src.bone(n).getWorldQuaternion(new THREE.Quaternion()).multiply(srcW0.get(n).clone().invert())
      const dT = tgt.bone(n).getWorldQuaternion(new THREE.Quaternion()).multiply(tgtW0.get(n).clone().invert())
      expectSameRotation(dT, dS, 1e-4)
    }
  })
})

describe('retargetMixamoClip — (d) DELTA_KEEP 팔 감쇠', () => {
  it('교차 리그(믹사모→블렌더): 위팔 80%·어깨 90%·아래팔 100%', () => {
    const src = buildRig(MIXAMO_BONES, { prefix: MIX })
    const tgt = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    const rotations = {
      [`${MIX}LeftArm`]: qAxis(0, 0, 1, 90),
      [`${MIX}LeftShoulder`]: qAxis(0, 0, 1, 90),
      [`${MIX}LeftForeArm`]: qAxis(0, 0, 1, 90),
    }
    const out = retargetMixamoClip(makeClip(mixNames, { rotations }), src.root, tgt.root)
    expect(angleDeg(lastQuat(track(out, 'upper_armL.quaternion')))).toBeCloseTo(72, 3)
    expect(angleDeg(lastQuat(track(out, 'shoulderL.quaternion')))).toBeCloseTo(81, 3)
    expect(angleDeg(lastQuat(track(out, 'forearmL.quaternion')))).toBeCloseTo(90, 3)
  })
})

describe('retargetMixamoClip — (e) 블렌더 리그 소스(믹사모에 자기 캐릭터 업로드 후 받은 FBX)', () => {
  it('블렌더 소스 → 믹사모 타깃: MIXAMO_FROM_BLENDER 역매핑으로 spine→Hips', () => {
    const src = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    const tgt = buildRig(MIXAMO_BONES, { prefix: MIX })
    const clip = makeClip(blNames)
    const out = retargetMixamoClip(clip, src.root, tgt.root)
    expect(out).not.toBeNull()
    expectSameRotation(lastQuat(track(out, `${MIX}Hips.quaternion`)), lastQuat(track(clip, 'spine.quaternion')))
    expectSameRotation(lastQuat(track(out, `${MIX}Spine.quaternion`)), lastQuat(track(clip, 'spine001.quaternion')))
    expectSameRotation(lastQuat(track(out, `${MIX}Head.quaternion`)), lastQuat(track(clip, 'spine005.quaternion')))
  })

  it('블렌더 소스 → 같은 블렌더 캐릭터: 본 이름이 같으면 팔 감쇠를 적용하지 않는다', () => {
    const src = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    const tgt = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    const clip = makeClip(blNames, { rotations: { upper_armL: qAxis(0, 0, 1, 90), shoulderL: qAxis(0, 0, 1, 90) } })
    const out = retargetMixamoClip(clip, src.root, tgt.root)
    expect(angleDeg(lastQuat(track(out, 'upper_armL.quaternion')))).toBeCloseTo(90, 3)
    expect(angleDeg(lastQuat(track(out, 'shoulderL.quaternion')))).toBeCloseTo(90, 3)
    expectSameRotation(lastQuat(track(out, 'spine.quaternion')), lastQuat(track(clip, 'spine.quaternion')))
  })
})

describe('retargetMixamoClip — (f) 루트 모션(position) 트랙', () => {
  it('같은 이름 노드면 position 을 복사본으로 통과(카포에이라 이동 유지)', () => {
    const src = buildRig(MIXAMO_BONES, { prefix: MIX })
    const tgt = buildRig(MIXAMO_BONES, { prefix: MIX })
    const clip = makeClip(mixNames, { positions: { [`${MIX}Hips`]: [[0, 0, 0], [0, 0, 1.5]] } })
    const out = retargetMixamoClip(clip, src.root, tgt.root)
    const pos = track(out, `${MIX}Hips.position`)
    expect(pos).toBeDefined()
    expect(Array.from(pos.values)).toEqual([0, 0, 0, 0, 0, 1.5])
    expect(pos.values).not.toBe(track(clip, `${MIX}Hips.position`).values)
  })

  it('블렌더 리그 루트(metarig, 본 아님)의 position/quaternion 도 같은 이름이면 통과', () => {
    const src = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    const tgt = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    expect(collectRigNodes(tgt.root).map(n => n.name)).toContain('metarig')
    const clip = makeClip([...blNames, 'metarig'], { positions: { metarig: [[0, 0, 0], [2, 0, 0]] } })
    const out = retargetMixamoClip(clip, src.root, tgt.root)
    expect(track(out, 'metarig.position')).toBeDefined()
    expect(track(out, 'metarig.quaternion')).toBeDefined()
  })

  it('교차 리그(정규화 키는 같지만 실제 이름이 다름)는 position 을 버리고 회전만', () => {
    const src = buildRig(MIXAMO_BONES, { prefix: MIX })           // mixamorigHips (cm 단위 믹사모)
    const tgt = buildRig(MIXAMO_BONES, { rootName: 'Root' })       // Hips (다른 리그/단위계)
    const clip = makeClip(mixNames, { positions: { [`${MIX}Hips`]: [[0, 0, 0], [0, 0, 150]] } })
    const out = retargetMixamoClip(clip, src.root, tgt.root)
    expect(out).not.toBeNull()
    expect(out.tracks.filter(t => t.name.endsWith('.position'))).toEqual([])
    expect(track(out, 'Hips.quaternion')).toBeDefined()
  })

  it('믹사모→블렌더 교차 리그에서도 position 은 버린다', () => {
    const src = buildRig(MIXAMO_BONES, { prefix: MIX })
    const tgt = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    const clip = makeClip(mixNames, { positions: { [`${MIX}Hips`]: [[0, 0, 0], [0, 0, 150]] } })
    const out = retargetMixamoClip(clip, src.root, tgt.root)
    expect(out.tracks.some(t => t.name.endsWith('.position'))).toBe(false)
  })
})

describe('retargetMixamoClip — (g) 유효 트랙 8개 미만이면 null', () => {
  const src = buildRig(MIXAMO_BONES, { prefix: MIX })
  const tgt = buildRig(MIXAMO_BONES, { prefix: MIX })
  it('7개 → null', () => {
    expect(retargetMixamoClip(makeClip(mixNames.slice(0, 7)), src.root, tgt.root)).toBeNull()
  })
  it('8개 → 클립', () => {
    expect(retargetMixamoClip(makeClip(mixNames.slice(0, 8)), src.root, tgt.root)?.tracks).toHaveLength(8)
  })
  it('소스에 hips 도 블렌더 척추도 없으면 null', () => {
    const generic = buildRig([['Bone', null], ['Bone001', 'Bone']])
    expect(retargetMixamoClip(makeClip(['Bone', 'Bone001']), generic.root, tgt.root)).toBeNull()
  })
})

describe('rest 포즈 복원(#158) — AssetViewer360 내부 로직 추출 가능성 검증', () => {
  // AssetViewer360.jsx:1391-1394(저장) / 1298-1307(복원) 을 그대로 옮긴 형태.
  const capture = (root) => collectRigNodes(root).map(o => ({
    bone: o, position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone(),
  }))
  const restore = (root, saved) => {
    for (const { bone, position, quaternion, scale } of saved) {
      bone.position.copy(position); bone.quaternion.copy(quaternion); bone.scale.copy(scale)
    }
    root.updateMatrixWorld(true)
  }

  it('재생 중 포즈를 rest 로 오인하면 두 번째 리타게팅이 틀어지고, 복원하면 첫 결과와 같다', () => {
    const src = buildRig(MIXAMO_BONES, { prefix: MIX })
    const tgt = buildRig(BLENDER_BONES, { rootName: 'metarig' })
    const clip = makeClip(mixNames)
    const saved = capture(tgt.root)
    const out1 = retargetMixamoClip(clip, src.root, tgt.root)
    const frame = () => {   // mixer 가 t=1 프레임을 찍은 상태를 흉내
      for (const t of out1.tracks) tgt.root.getObjectByName(t.name.split('.')[0]).quaternion.copy(lastQuat(t))
      tgt.root.updateMatrixWorld(true)
    }

    frame()
    const drifted = retargetMixamoClip(clip, src.root, tgt.root)
    expect(drifted.tracks.map(t => Array.from(t.values))).not.toEqual(out1.tracks.map(t => Array.from(t.values)))

    frame()
    restore(tgt.root, saved)
    const fixed = retargetMixamoClip(clip, src.root, tgt.root)
    expect(fixed.tracks.map(t => Array.from(t.values))).toEqual(out1.tracks.map(t => Array.from(t.values)))
  })
})

describe('발견 후보 — 실파일 확인 필요', () => {
  // 믹사모는 이미 mixamorig 이름을 가진 캐릭터를 재업로드하면 'mixamorig1:' 같은 번호 접두를 붙여 내보내는 경우가 있다.
  // normalizeBoneKey 는 /^mixamorig/ 만 떼서 '1hips' 가 된다 → 휴머노이드 판정 실패 → 드롭 시 "본 구조가 맞지 않아" 토스트.
  it.fails('mixamorig1: 접두 리그도 휴머노이드로 인식해야 한다(현재 실패)', () => {
    expect(normalizeBoneKey('mixamorig1:Hips')).toBe('hips')
    expect(isRetargetableHumanoid(buildRig(MIXAMO_BONES, { prefix: 'mixamorig1' }).root)).toBe(true)
  })
})

// distinctRot 은 팩토리 기본값 — 여기서 import 만 해 두어 헬퍼 회귀도 잡는다
it('rigFactory sanity: distinctRot 는 본마다 다르다', () => {
  expect(distinctRot(0).equals(distinctRot(1))).toBe(false)
})
