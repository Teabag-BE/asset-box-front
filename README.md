# AssetBox Frontend

AssetBox 프론트엔드입니다. React 19, Vite, Tailwind CSS v4, React Router v7 기반으로 에셋, 요청, 포트폴리오, 메시지 화면을 제공합니다.

## 주요 기능

| 영역 | 경로 | 설명 |
| --- | --- | --- |
| 홈 | `/` | 주요 화면 바로가기 |
| 인증 | `/login`, `/signup` | JWT 기반 로그인/회원가입 |
| 에셋 | `/assets`, `/assets/new`, `/assets/:id` | 에셋 목록, 등록, 상세, 3D 뷰어 |
| 요청 | `/requests`, `/requests/new`, `/requests/:id` | 요청 목록, 작성, 상세, 수락 |
| 포트폴리오 | `/profile`, `/portfolio/:userId` | 내 프로필, 공개 포트폴리오 |
| 디렉토리 | `/directory` | 에셋 작성자 기반 팀원 목록 |
| 검색 | `/search?q=` | 클라이언트 기반 에셋 검색 |
| 메시지 | `/inbox`, `/messages/:partnerId` | 1:1 메시지 |

## 로컬 실행

백엔드(`team`)를 먼저 실행한 뒤 프론트를 실행합니다.

```bash
npm install
npm run dev
```

기본 접속 주소:

```text
http://localhost:3000
```

개발 서버는 `.env.development`의 `VITE_API_BASE_URL=/api` 설정을 사용합니다. Vite proxy가 `/api` 요청을 백엔드 `http://localhost:8080`으로 전달합니다.

## 백엔드 연동 기준

- 인증 토큰은 `localStorage.accessToken`에 저장합니다.
- 로그인/회원가입 요청에는 Authorization 헤더를 붙이지 않습니다.
- 에셋 등록은 백엔드 `POST /api/posts` 계약에 맞춰 `request`, `thumbnail`, `assets` multipart 파트를 한 번에 전송합니다.
- 현재 백엔드 `FileValidator` 기준으로 모델 파일은 `.fbx`만 허용합니다.
- 파일 미리보기와 다운로드는 백엔드가 발급한 S3 presigned URL을 사용합니다.

## 검증한 동작

- 로그인 후 `/assets/new`에서 썸네일과 `.fbx` 파일을 포함한 에셋 등록
- 생성된 에셋 상세 조회
- 파일 presigned URL 조회
- S3 presigned GET을 통한 모델 파일 접근

## 빌드

```bash
npm run lint
npm run build
```

Docker Compose 환경에서는 백엔드 repo의 `docker-compose.yml`이 `../teabag-front`를 프론트 빌드 컨텍스트로 사용합니다.
