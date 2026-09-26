import { describe, it, expect } from 'vitest'
import { UPDATES, latestUpdate } from './updates'

describe('latestUpdate — 홈 랜딩 하이라이트', () => {
  it('배열 맨 앞 라운드에서 highlight 항목만 최대 3개', () => {
    const u = latestUpdate()
    expect(u.id).toBe(UPDATES[0].id)
    expect(u.highlights.length).toBeGreaterThan(0)
    expect(u.highlights.length).toBeLessThanOrEqual(3)
    expect(u.highlights.every(h => h.highlight === true)).toBe(true)
    const all = UPDATES[0].sections.flatMap(s => s.items)
    expect(u.highlights.every(h => all.includes(h))).toBe(true)
  })
})

describe('UPDATES 데이터 불변식', () => {
  it('최신 라운드가 맨 앞(날짜 내림차순) — 뒤에 추가하면 홈이 옛 라운드를 보여준다', () => {
    const dates = UPDATES.map(r => r.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)
  })
  it('라운드 id 유일, 날짜 형식 YYYY-MM-DD', () => {
    expect(new Set(UPDATES.map(r => r.id)).size).toBe(UPDATES.length)
    for (const r of UPDATES) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('배지는 BADGE_STYLE 키(NEW/개선/FIX/SOON)만, 항목 title 은 섹션 안에서 유일(React key)', () => {
    for (const r of UPDATES) {
      for (const s of r.sections) {
        const titles = s.items.map(i => i.title)
        expect(new Set(titles).size, `${r.id}/${s.name}`).toBe(titles.length)
        for (const i of s.items) expect(['NEW', '개선', 'FIX', 'SOON'], `${r.id}/${i.title}`).toContain(i.badge)
      }
    }
  })
  it('홈 하이라이트 key(title) 가 최신 라운드 안에서 유일', () => {
    const titles = latestUpdate().highlights.map(h => h.title)
    expect(new Set(titles).size).toBe(titles.length)
  })
})
