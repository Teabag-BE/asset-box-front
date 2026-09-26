import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { timeAgo, formatTime, formatDateTime } from './timeAgo'

// ICU 버전에 따라 공백 문자가 달라질 수 있어(U+202F 등) 정규화해서 비교
const norm = (s) => s.replace(/\s/g, ' ')

beforeAll(() => {
  // vitest.config.js 에서 TZ=Asia/Seoul 로 고정. 누가 그 설정을 지우면 여기서 명시적으로 터진다
  // (UTC 러너에선 #104 회귀가 재현되지 않아 테스트가 "거짓 통과"하기 때문).
  expect(process.env.TZ).toBe('Asia/Seoul')
  expect(new Date('2026-07-16T00:00:00Z').getTimezoneOffset()).toBe(-540)
})

describe('timeAgo — #104 TZ 없는 서버 시각(UTC LocalDateTime)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T01:00:30Z')) // KST 10:00:30
  })
  afterEach(() => vi.useRealTimers())

  it('방금 올린 글이 "9시간 전"이 아니라 "방금"', () => {
    expect(timeAgo('2026-07-16T01:00:00')).toBe('방금')
  })
  it('Jackson LocalDateTime 마이크로초 표기도 UTC 로 해석', () => {
    expect(timeAgo('2026-07-16T01:00:00.123456')).toBe('방금')
  })
  it('초가 생략된 표기(T01:00)도 UTC 로 해석', () => {
    expect(timeAgo('2026-07-16T01:00')).toBe('방금')
  })
  it('이미 TZ 가 있으면(Z / +09:00 / +0900) 그대로', () => {
    expect(timeAgo('2026-07-16T01:00:00Z')).toBe('방금')
    expect(timeAgo('2026-07-16T10:00:00+09:00')).toBe('방금')
    expect(timeAgo('2026-07-16T10:00:00+0900')).toBe('방금')
  })
  it.each([
    ['2026-07-16T00:55:00', '5분 전'],
    ['2026-07-15T22:00:00', '3시간 전'],
    ['2026-07-13T01:00:00', '3일 전'],
  ])('%s → %s', (iso, label) => {
    expect(timeAgo(iso)).toBe(label)
  })
  it('30일 이상은 KST 날짜로 표시', () => {
    // UTC 5/31 15:30 = KST 6/1 00:30 → 날짜가 하루 넘어가야 한다
    expect(timeAgo('2026-05-31T15:30:00')).toBe('2026. 6. 1.')
  })
  it.each([[null], [undefined], [''], ['not-a-date']])('잘못된 입력 %s → 빈 문자열', (v) => {
    expect(timeAgo(v)).toBe('')
  })
})

// 오전/오후 라벨은 런타임 ICU 데이터에 따라 '오후' 또는 'PM'으로 나온다(CI Node 22는 'PM', 로컬 Node 20·25는 '오후').
// 지키려는 것은 라벨이 아니라 "9시간 어긋나지 않은 시·분"이므로 라벨은 둘 다 허용하고 시각은 정확히 고정한다.
const PM = '(?:오후|PM)'
const AM = '(?:오전|AM)'

describe('formatTime — DM 말풍선 시각(GMT 로 보이던 회귀)', () => {
  it('UTC 06:24 → KST 오후 03:24', () => {
    expect(norm(formatTime('2026-07-16T06:24:00'))).toMatch(new RegExp(`^${PM} 03:24$`))
  })
})

describe('formatDateTime — 요청 상세 절대 시각', () => {
  it('UTC 06:24 → 2026년 7월 16일 오후 03:24', () => {
    expect(norm(formatDateTime('2026-07-16T06:24:00'))).toMatch(new RegExp(`^2026년 7월 16일 ${PM} 03:24$`))
  })
  it('UTC 자정 직전 → KST 다음 날로 넘어간다', () => {
    expect(norm(formatDateTime('2026-07-15T16:30:00'))).toMatch(new RegExp(`^2026년 7월 16일 ${AM} 01:30$`))
  })
})
