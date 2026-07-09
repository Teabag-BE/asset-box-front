import { useRef, useState } from 'react'
import { cn } from '../utils/cn'

// 파일 드래그앤드롭 + 클릭 선택을 함께 지원하는 재사용 드롭존.
// - accept  : 네이티브 파일 선택창 필터(input accept)
// - label   : 미선택 시 안내 문구
// - hint    : 보조 안내(작은 글씨)
// - icon    : 상단 이모지
// - file    : 현재 선택된 File(이름·용량 표시용)
// - onFile  : 파일이 선택/드롭되면 호출(File 또는 null)
export default function FileDropzone({
  accept,
  label = '파일을 여기로 끌어다 놓거나 클릭해서 선택',
  hint,
  icon = '📦',
  file,
  onFile,
}) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  function openPicker() {
    inputRef.current?.click()
  }

  function onDrop(e) {
    e.preventDefault()
    setDrag(false)
    // 여러 개를 떨궈도 첫 파일만 사용한다.
    const f = e.dataTransfer?.files?.[0]
    if (f) onFile(f)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={openPicker}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } }}
      // dragover 를 계속 preventDefault 해야 브라우저 기본 동작(파일 열기)이 막히고 drop 이 발생한다.
      onDragOver={e => { e.preventDefault(); if (!drag) setDrag(true) }}
      onDragEnter={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={e => { e.preventDefault(); setDrag(false) }}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-7 text-center cursor-pointer transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-[#869B7E]/60',
        drag
          ? 'border-[#869B7E] bg-linen-50'
          : 'border-[#C9CAAC]/70 bg-white hover:bg-linen-50/60',
      )}
    >
      <span className="text-2xl" aria-hidden="true">{drag ? '📥' : icon}</span>
      {file ? (
        <span className="text-sm text-slate-700 break-all">
          <b>{file.name}</b>
          <span className="text-slate-400"> ({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
        </span>
      ) : (
        <span className="text-sm text-slate-500">{drag ? '여기에 놓으세요' : label}</span>
      )}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
      {file && <span className="text-xs text-[#869B7E]">다른 파일로 바꾸려면 다시 끌어다 놓거나 클릭</span>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        // label 로 감싸지 않고 ref.click() 로 여는 방식 — 드롭존 전체가 클릭 영역이 된다.
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        className="hidden"
      />
    </div>
  )
}
