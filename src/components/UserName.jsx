import { useEffect, useState } from 'react'
import { resolveUserName } from '../utils/userNames'

// userId 를 닉네임으로 비동기 해석해 표시한다. 로딩/실패 시 '유저 #id' 폴백(resolveUserName 캐시).
// 백엔드가 요청/게시글 등에서 작성자를 id 로만 내려줄 때, 화면에 #번호 대신 닉네임을 보이게 한다.
export default function UserName({ id, className }) {
  const [name, setName] = useState(id != null ? `유저 #${id}` : '유저')

  useEffect(() => {
    if (id == null) return undefined
    let alive = true
    resolveUserName(id).then(n => { if (alive) setName(n) })
    return () => { alive = false }
  }, [id])

  return <span className={className}>{name}</span>
}
