import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postApi } from '../../api/postApi'
import AssetGrid from './AssetGrid'
import Avatar from '../../components/Avatar'
import Button from '../../components/Button'

// 유저 프로필 + 그 유저가 올린 에셋 (백엔드 authorId 필터 없어 클라이언트에서 필터)
export default function PortfolioView({ profile, isMe, onAvatarChange, onSaveProfile }) {
  const navigate = useNavigate()
  const fileRef = useRef()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nickname: '', description: '', major: '', publicEmail: '' })

  function startEdit() {
    setForm({
      nickname: profile.nickname ?? '',
      description: profile.description ?? '',
      major: profile.major ?? '',
      publicEmail: profile.publicEmail ?? '',
    })
    setEditing(true)
  }

  async function submitEdit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSaveProfile?.(form)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    postApi.getList({ size: 100 })
      .then(res => setPosts(res.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const mine = useMemo(
    () => posts.filter(p => String(p.authorId) === String(profile.id)),
    [posts, profile.id],
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 프로필 헤더 */}
      <div className="bg-white border border-[#C9CAAC]/40 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar src={profile.avatarUrl} nickname={profile.nickname} size="xl" />
            {isMe && (
              <button onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 bg-[#869B7E] text-white text-xs rounded-full w-7 h-7 flex items-center justify-center shadow hover:bg-[#6b7d64]"
                title="아바타 변경">✎</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onAvatarChange?.(f) }} />
          </div>
          <div className="flex-1 min-w-0">
            {isMe && editing ? (
              <form onSubmit={submitEdit} className="flex flex-col gap-2">
                <input value={form.nickname} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
                  required minLength={2} maxLength={30} placeholder="닉네임"
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-lg font-bold focus:outline-none focus:border-[#869B7E]" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.major} onChange={e => setForm(p => ({ ...p, major: e.target.value }))}
                    maxLength={50} placeholder="전공/직군 (예: BACK_END)"
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#869B7E]" />
                  <input type="email" value={form.publicEmail} onChange={e => setForm(p => ({ ...p, publicEmail: e.target.value }))}
                    maxLength={50} placeholder="공개 이메일 (선택)"
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#869B7E]" />
                </div>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} maxLength={500} placeholder="자기소개"
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#869B7E]" />
                <div className="flex gap-2 mt-1">
                  <Button type="submit" size="sm" disabled={saving}>{saving ? '저장 중…' : '저장'}</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>취소</Button>
                </div>
              </form>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-900">{profile.nickname}</h1>
                <p className="text-sm text-slate-400">{profile.publicEmail || profile.email}</p>
                {profile.major && <p className="text-xs text-slate-400 mt-0.5">{profile.major}</p>}
                <p className="text-sm text-slate-600 mt-2">{profile.description || '소개가 없습니다.'}</p>

                <div className="flex gap-6 mt-4">
                  <div><span className="font-bold text-slate-900">{mine.length}</span> <span className="text-xs text-slate-400">에셋</span></div>
                  {/* 좋아요/조회 합계는 백엔드 카운트 노출되면 표시 */}
                  <div><span className="font-bold text-slate-900">0</span> <span className="text-xs text-slate-400">좋아요</span></div>
                  <div><span className="font-bold text-slate-900">0</span> <span className="text-xs text-slate-400">조회</span></div>
                </div>

                <div className="mt-4">
                  {isMe
                    ? <Button variant="secondary" size="sm" onClick={startEdit}>✎ 프로필 편집</Button>
                    : <Button variant="secondary" size="sm" onClick={() => navigate(`/messages/${profile.id}`)}>💬 메시지 보내기</Button>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 업로드한 에셋 */}
      <h2 className="text-sm font-semibold text-slate-700 mb-3 border-b border-linen-200 pb-2">업로드한 에셋</h2>
      <AssetGrid posts={mine} loading={loading} />
    </div>
  )
}
