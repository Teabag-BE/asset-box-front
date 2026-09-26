import { useState } from 'react'

// 백엔드 TagService 규칙과 동일: 소문자화 후 한글·영문·숫자·_- 만, 30자 이하.
// 여기서 거르지 않으면 대용량 업로드가 다 끝난 뒤에야 400 으로 등록 전체가 실패한다.
const TAG_PATTERN = /^[가-힣a-z0-9_-]+$/
const TAG_MAX = 30

export default function TagInput({ value, onChange }) {
  const [input, setInput] = useState('')
  const [hint, setHint] = useState('')
  const tags = value.filter(Boolean)

  function addTag(raw) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (!t) { setInput(''); return }
    if (t.length > TAG_MAX) { setHint(`태그는 ${TAG_MAX}자까지 쓸 수 있어요.`); return }
    if (!TAG_PATTERN.test(t)) { setHint('태그에는 한글·영문·숫자·_ - 만 쓸 수 있어요.'); return }
    if (!tags.includes(t) && tags.length < 10) onChange([...tags, t])
    setHint('')
    setInput('')
  }
  function removeTag(t) { onChange(tags.filter(x => x !== t)) }
  function handleKeyDown(e) {
    // 한글 조합 중 Enter 는 조합 확정용이다 — 여기서 태그를 만들면 마지막 음절이 따로 남거나 중복된다.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
    else if (e.key === 'Backspace' && !input && tags.length > 0) removeTag(tags[tags.length - 1])
  }

  return (
    <div>
      <label className="text-sm font-medium text-slate-700 block mb-1">태그 <span className="text-slate-400 font-normal">(최대 10개 · Enter 또는 쉼표로 추가)</span></label>
      <div className="flex flex-wrap gap-1.5 p-2 border border-[#C9CAAC]/80 bg-white rounded-lg focus-within:border-[#869B7E] min-h-[42px] cursor-text transition-colors"
           onClick={() => document.getElementById('tagInput')?.focus()}>
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 bg-sage-100 text-sage-700 text-xs rounded-full px-2.5 py-1">
            #{t}
            <button type="button" onClick={() => removeTag(t)} aria-label={`태그 ${t} 삭제`} className="hover:text-red-500">×</button>
          </span>
        ))}
        <input
          id="tagInput"
          value={input}
          onChange={e => { setInput(e.target.value); if (hint) setHint('') }}
          onKeyDown={handleKeyDown}
          onBlur={() => input.trim() && addTag(input)}
          placeholder={tags.length === 0 ? 'character, blender, pbr ...' : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
        />
      </div>
      {hint && <p role="alert" className="text-xs text-crimson-600 mt-1">{hint}</p>}
    </div>
  )
}
