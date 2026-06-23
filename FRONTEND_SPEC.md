# AssetBox 프론트엔드 스펙

> **이 문서가 프론트 단일 기준이다.** 스크린샷 대조 대신 여기서 페이지·기능·상태를 확인한다.
> 최종 목표 UI = `Mock/teabag-front` (완성형). 그 깔(디자인/레이아웃)을 그대로 맞추되,
> **우리 팀 백엔드(`Teabag-BE/Asset-Box`)가 지원하지 않는 기능은 주석/스텁 처리**하고 백엔드가 생기면 켠다.

## 범례
- ✅ **구현** — 우리 백엔드로 동작
- 🟡 **스텁** — UI는 mock대로 두되 데이터 없음(0/빈값/“준비 중”) 또는 주석. 백엔드 생기면 활성
- ⛔ **백엔드 없음** — API 자체가 없어 화면/기능 보류
- 🔧 **구조차이** — mock과 우리 백엔드 DTO/엔드포인트가 달라 어댑터 필요

---

## 1. 페이지 인벤토리 (mock 기준 전체)

| Mock 페이지 | 우리 현황 | 목표 | 핵심 백엔드 | 상태 |
|---|---|---|---|---|
| 에셋 메인 (/assets) | ✅ **사이드바+검색+정렬탭+인기태그** | (인기/조회 정렬은 비활성) | `/posts`, `/categories` | ✅ (검색·필터·태그 **클라이언트**, 인기정렬 🟡) |
| 홈 허브 (/) | ✅ 바로가기 카드 | 디렉토리 카드 추가 | — | ✅ |
| 에셋 상세 (AssetDetail) | ✅ 2단+뷰어 | + 좋아요/댓글/다운로드파일/작성자포폴 | `/posts/{id}`, `/files`, like⛔, comment⛔ | ✅ 기본 / 🟡 나머지 |
| 에셋 등록 (Upload) | ✅ 폼+태그+카테고리 | mock 톤 유지 | `POST /posts` multipart (`request`, `thumbnail`, `assets`) | ✅ |
| 에셋 수정 (EditPost) | ❌ 없음 | 추가 | `PUT /posts/{id}` ✅ | 🟡 만들 수 있음 |
| 요청 게시판 (RequestBoard) | ✅ **상태탭 + 리치카드** | (assetType/engine/마감/담당) | `/requests` ✅ | ✅ 완료 |
| 요청 상세 (RequestDetail) | ✅ **2단 + 3단계 타임라인 + 수락** | 요청자/담당TA/레퍼런스/연결에셋 | `/requests/{id}` ✅, `/{id}/assign` ✅ | ✅ 완료 / 댓글 🟡 |
| 요청 작성 (CreateRequest) | ✅ 폼 (멀티파트 수정됨) | — | `POST /requests` (multipart) ✅ | ✅ |
| **TA 디렉토리 (/directory)** | ✅ 작성자 기반 랭킹 그리드 | 유저목록 API 생기면 교체 | (현재) `/posts`+`/users/{id}` N+1 | ✅ (클라이언트 구성, 좋아요수 🟡) |
| **포트폴리오 (/portfolio/:id)** | ✅ 정보+에셋 그리드 | 통계는 스텁 | `/users/{id}` ✅, posts authorId **클라이언트 필터** | ✅ / 좋아요·조회 🟡 |
| 프로필 (/profile) | ✅ 포트폴리오뷰+아바타변경+로그아웃 | 닉네임·소개 수정은 보류 | `/users/me`, `POST /users/me/avatar` ✅ | ✅ / 텍스트수정 ⛔ |
| **검색 (/search?q=)** | ✅ 제목·태그 클라이언트 검색 | 서버검색 생기면 교체 | (현재) 클라이언트 | ✅ (클라이언트) |
| 메시지 인박스 (Inbox) | ✅ Avatar/Button/EmptyState 톤 통일 | (닉네임 없어 #id) | `/messages/inbox` ✅ | ✅ (폴링) |
| 대화 (Conversation) | ✅ Avatar 헤더 + 포폴 링크 | — | `/messages/*` ✅ | ✅ (폴링) |
| 관리자 (AdminDashboard) | ❌ 없음 | 후순위 | `/api/admin/*` ✅(일부) | 🟡 후순위 |

---

## 2. 기능별 백엔드 의존성

| 기능 | 필요 API | 현황 |
|---|---|---|
| 좋아요 (토글/카운트/좋아요한 목록) | `POST /posts/{id}/like` 등 | ⛔ 없음 |
| 조회수 / 다운로드 수 | 카운트 증가 + DTO 노출 | ⛔ DTO 미노출 |
| 에셋 댓글 | `/posts/{id}/comments` CRUD | 🟡 GET 스텁만 (이슈 #100 진행) |
| 요청 댓글 | `/requests/{id}/comments` CRUD | 🟡 GET 스텁만 |
| 에셋 검색/정렬/필터 | `/posts?search=&sort=&categoryId=&tag=` | ⛔ 페이지네이션만 |
| 인기 에셋 / 인기 태그 | `/posts?sort=popular`, `/posts/popular-tags` | ⛔ 없음 |
| 유저 목록 (TA 디렉토리) | `GET /users` (+통계) | ⛔ 단건만 |
| 유저별 에셋 (포트폴리오) | `/posts?authorId=` | ⛔ 필터 없음 |
| 에셋 파일 메타(이름/확장자/id) | 파일 목록 DTO | 🟡 presigned URL만 (확장자 파싱으로 우회) |
| 작성자 닉네임 (목록/카드) | posts DTO에 authorNickname | ⛔ authorId만 (지금 `#id`로 degrade) |

---

## 2.5 요청 상태 (기획 `04_api/06_명세서_Request.md` 기준)
- **현재 MVP 흐름은 3단계 직행**: `요청됨(REQUESTED) → 제작중(IN_PROGRESS) → 완료(COMPLETED)`
  - 요청됨→제작중: `PATCH /requests/{id}/assign` (TA 본인이 수락)
  - 제작중→완료: **완료 버튼 없음** — `POST /posts` 에 `linkedRequestId` 넣으면 자동 완료
- `IN_REVIEW(검토중)`: enum에만 존재, **추후 도입 검토** (현재 탭/흐름에서 제외)
- `REJECTED(반려)`: reject/reopen API **현재 미구현** (탭 제외, badge만 유지)
- 삭제: **REQUESTED 상태 + 요청자 본인**만 (명세 R-8)
- 프론트 반영: 탭 = 전체/요청됨/제작중/완료, 타임라인 = 3단계, 라벨 IN_PROGRESS=**제작중**

## 3. 🔧 mock ↔ 우리 백엔드 구조 차이 (어댑터 시 주의)

| 항목 | mock 백엔드 | 우리 백엔드 |
|---|---|---|
| 모델 파일 업로드 | post 생성에 파일 동봉 (1콜) | `POST /posts`에 `assets` 파트로 동봉 |
| 파일 조회 | 상세에 `post.files[]`(id/확장자) | `/files/get/presigned-urls` URL 문자열만 |
| 파일 서빙 | `/posts/{id}/files/{fileId}` 스트림 | S3 presigned URL (버킷 CORS 필요) |
| 파일 저장소 | 로컬 `./uploads` | **S3** (presigned URL 기반 조회) |
| 인증 | (mock 방식) | JWT accessToken + refresh 쿠키 |
| 회원가입 | 자유 | **이메일 화이트리스트**(`email_white_list`) |
| 카테고리 응답 | (mock) | `/categories`(평면), `/roots`, `/{id}/children` |

---

## 4. 스텁 규칙 (백엔드 생기면 켜는 법)
- 데이터 없는 카운트: `likeCount ?? 0`, `viewCount ?? 0` 로 0 표시 (UI 유지)
- 작성자 닉네임 없음: `authorNickname || '#'+authorId`
- 미구현 섹션(댓글 등): `{/* TODO(백엔드 X 연결되면): ... */}` 주석 + “준비 중” 안내
- 미구현 페이지(디렉토리/검색): 라우트는 두되 EmptyState로 “백엔드 준비 중” 안내
- 활성화 조건은 본 문서 2번 표의 API가 생기는 시점

---

## 5. 진행 순서 (방식2 = 페이지별 업그레이드)
1. ✅ 공통 UI 키트 정착 (Button/Badge/Avatar/EmptyState/Spinner)  ← Card/Toaster 추후
2. ✅ **요청 게시판/상세/작성** → 상태탭·리치카드·타임라인·수락 (멀티파트 create 드리프트도 수정)
3. ✅ 에셋 게시판/상세/등록 + 3D 뷰어 (S3 업로드/조회 검증 완료)
4. ✅ 에셋 메인 → 사이드바(카테고리)+검색+정렬탭+인기태그 (클라이언트 필터)
5. ✅ 포트폴리오/프로필 → 프로필=포트폴리오뷰+아바타변경, /portfolio/:id 공개뷰
6. ✅ 디렉토리/검색 → 작성자기반 디렉토리 + 클라이언트 검색 (+nav 검색바)
7. ✅ 메시지(인박스/대화) → Avatar/Button/EmptyState 톤 통일, 헤더 포폴 링크

> 페이지별 업그레이드 1~7 **완료**. 남은 건 백엔드 의존 기능(2번 표) 활성화뿐.

### 클라이언트 우회 목록 (백엔드 생기면 서버사이드로 교체)
- 에셋 검색/카테고리필터/태그필터 → 불러온 posts에서 필터
- 인기 태그 → posts 태그 빈도 집계
- TA 디렉토리 → posts 작성자 distinct + `/users/{id}` N+1
- 포트폴리오의 유저별 에셋 → posts authorId 필터
> 각 단계마다 “구현 vs 스텁”을 본 문서 표에 갱신한다.
