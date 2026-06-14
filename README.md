# teabag-front (M1)

AssetBox **M1 프론트엔드** — 유저 간 1:1 다이렉트 메시지 (REST Polling).
React 19 + Vite + Tailwind v4 + react-router v7.

## 실행

```bash
npm install        # 최초 1회 (node_modules 포함 복사돼 있으면 생략 가능)
npm run dev        # http://localhost:5173
```

백엔드(`team`)를 `http://localhost:8080`에 띄워두면, dev 서버가 `/api` 요청을
프록시로 전달하므로 **CORS 설정 없이** 동작합니다. (`.env.development` 참고)

## 구현 범위 (M1)

| 화면 | 경로 | 백엔드 |
|------|------|--------|
| 홈 | `/` | - |
| 로그인 / 회원가입 | `/login`, `/signup` | `POST /api/users/login`, `/signup` |
| 인박스(대화방 목록) | `/inbox` | `GET /api/messages/inbox` |
| 대화창 | `/messages/:partnerId` | `GET /conversation/{id}`, `POST /messages`, `PATCH .../read` |

- **인증**: 로그인 시 받은 accessToken을 localStorage에 저장. 백엔드에 `/users/me`가 없어
  JWT를 디코드해 `{ email, role }`만 사용 (메시지 기능엔 내 userId 불필요).
- **실시간**: WebSocket 미사용. 안 읽음 수(15s)·인박스(10s)·대화(5s)를 **폴링**으로 갱신.
- **상대 표시**: 백엔드에 공개 user 조회가 없어 **`유저 #id`** 로 표시.
- **새 대화**: 프로필 화면이 없는 M1에선 인박스 상단에 상대 `userId`를 입력해 시작.

## 다음 단계 (미구현)

- posts / requests / categories 등 나머지 백엔드 기능 연동
- 상대 닉네임/아바타 표시 (백엔드 user 조회 API 필요)
- 이메일/닉네임 기반 수신자 지정, WebSocket 실시간 푸시
