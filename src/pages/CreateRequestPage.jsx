import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestApi } from '../api/requestApi'
import { useToast } from '../components/Toast'

const ENGINES = ['', 'UNREAL', 'UNITY', 'ETC']

export default function CreateRequestPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({
    title: '', content: '', assetType: '', preferredStyle: '', engine: '', deadline: '',
  })
  const [references, setReferences] = useState([])   // 참조 이미지(선택, 여러 장)
  const fileRef = useRef(null)                        // 숨긴 file input 참조(버튼으로 클릭)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))
  const inputCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#869B7E]'

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // requesterId는 백엔드가 토큰에서 가져옴 (멀티파트 /requests)
      const created = await requestApi.create({
        title: form.title,
        content: form.content,
        assetType: form.assetType || null,
        preferredStyle: form.preferredStyle || null,
        engine: form.engine || null,
        // datetime-local("2026-06-20T10:00") → 초 보강
        deadline: form.deadline ? `${form.deadline}:00` : null,
        references,
        // 첫 참조 이미지를 요청 썸네일로도 사용 → 목록 카드에 이미지가 뜨게 한다(별도 썸네일 입력 없음).
        thumbnail: references[0],
      })
      toast('요청이 등록되었습니다 🎉')
      navigate(created?.id ? `/requests/${created.id}` : '/requests')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 mb-4">요청 작성</h1>
      {error && <p className="text-crimson-600 text-sm mb-3">{error}</p>}
      <form onSubmit={onSubmit} className="flex flex-col gap-4 bg-white border border-slate-200 rounded-2xl p-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">제목</span>
          <input name="title" value={form.title} onChange={onChange} required maxLength={100} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">내용</span>
          <textarea name="content" value={form.content} onChange={onChange} required rows={5} className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">에셋 종류</span>
            <input name="assetType" value={form.assetType} onChange={onChange} maxLength={60} className={inputCls} placeholder="예: 캐릭터, 배경" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">선호 스타일</span>
            <input name="preferredStyle" value={form.preferredStyle} onChange={onChange} maxLength={60} className={inputCls} placeholder="예: 로우폴리" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">엔진</span>
            <select name="engine" value={form.engine} onChange={onChange} className={inputCls}>
              {ENGINES.map(e => <option key={e} value={e}>{e || '선택 안함'}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">마감 (선택)</span>
            <input name="deadline" type="datetime-local" value={form.deadline} onChange={onChange} className={inputCls} />
          </label>
        </div>
        {/* 스타일된 버튼으로 숨긴 file input 을 클릭 — 맨 <input type=file> 이 회색/미클릭되던 문제 회피(에셋 업로드와 동일 패턴). */}
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">참조 이미지 <span className="text-slate-400">(선택, 여러 장 가능)</span></span>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => setReferences(Array.from(e.target.files ?? []))} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-[#C9CAAC] bg-linen-50 px-3 py-2 text-sm text-[#4b5d45] hover:bg-linen-100 transition-colors">
            📎 이미지 선택{references.length > 0 ? ` (${references.length})` : ''}
          </button>
          {references.length > 0 && (
            <span className="text-xs text-slate-400">{references.map(f => f.name).join(', ')}</span>
          )}
        </div>
        <button type="submit" disabled={loading}
          className="mt-1 w-full bg-[#869B7E] disabled:bg-[#a9b8a3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#6b7d64] transition-colors">
          {loading ? '등록 중...' : '요청 등록'}
        </button>
      </form>
    </div>
  )
}
