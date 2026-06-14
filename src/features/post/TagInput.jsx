import { useState } from 'react'

export default function TagInput({ value, onChange }) {
  const [input, setInput] = useState('')
  const tags = value.filter(Boolean)

  function addTag(raw) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t) && tags.length < 10) onChange([...tags, t])
    setInput('')
  }
  function removeTag(t) { onChange(tags.filter(x => x !== t)) }
  function handleKeyDown(e) {
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
            <button type="button" onClick={() => removeTag(t)} className="hover:text-red-500">×</button>
          </span>
        ))}
        <input
          id="tagInput"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => input.trim() && addTag(input)}
          placeholder={tags.length === 0 ? 'character, blender, pbr ...' : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
        />
      </div>
    </div>
  )
}
