# 로컬 실행 트러블슈팅 기록 (AssetBox)

백엔드(`team`) + 프론트(`teabag-front`)를 로컬에서 처음 띄우며 겪은 문제와 해결 과정.
같은 삽질 반복 방지용. (작성: 2026-06)

---

## 1. dev 최신화 / 머지 충돌

- **증상**: 작업 브랜치가 `origin/dev`보다 44커밋 뒤처져 있었고, PR 머지 시 충돌.
- **원인**: 브랜치를 오래 들고 있으면서 dev를 자주 안 받아옴. (#12가 squash 머지되며 해시가 달라져 충돌로 인식)
- **해결**: `git fetch && git merge origin/dev` (rebase ❌ — 이미 push한 브랜치라 merge). `ort` 전략이 `SuccessCode` 등 자동 병합.
- **교훈**: **작업 시작 시 / PR 전마다 `git merge origin/dev`.** 자주 = 작은 충돌.

---

## 2. MySQL 접속 실패 (Access denied)

- **증상**: 앱 부팅 시 MySQL 오류. `mysql -u root` 도 `Access denied`.
- **원인**: 동기화로 받은 `.env.production`의 `dbPassWord`가 **이 컴퓨터 로컬 MySQL root 비번과 불일치**. (DB가 없어서가 아님)
- **해결**:
  1. `skip-grant-tables`로 MySQL 기동 → `ALTER USER 'root'@'localhost' IDENTIFIED BY '<.env값>'` 으로 **로컬 root 비번을 .env 값에 맞춤**.
  2. `CREATE DATABASE teo CHARACTER SET utf8mb4` (이모지/한글 대비 utf8mb4 필수).
- **메모**: MySQL=로컬 Homebrew(`teo` DB), Redis=docker. `ddl-auto: create-drop`이라 **테이블은 부팅마다 자동 생성**(DB(스키마)만 있으면 됨).

---

## 3. 테이블이 통째로 사라짐

- **증상**: 앱은 정상 기동했는데 `teo`에 테이블이 0개 → 모든 쿼리 `Table 'teo.xxx' doesn't exist`.
- **원인**: 앱이 떠 있는 상태에서 **`./gradlew test`** 실행 → `AssetBoxApplicationTests.contextLoads()`가 `@ActiveProfiles("test")` 없이 **기본 프로파일로 실제 `teo` DB에 접속**, 테스트 컨텍스트 종료 시 `create-drop`이 **모든 테이블을 DROP**.
- **해결**: 앱 재시작(→ 스키마 재생성). 그리고 **앱 켜둔 채 `gradlew test` 금지**.
- **근본 개선(백엔드/테스트 도메인)**: `contextLoads` 테스트에 test 프로파일/H2 강제.

---

## 4. 프론트 포트 충돌 + IPv4/IPv6

- **증상**: `localhost:5173` 열었더니 **다른 프로젝트(MindAnchor)** 가 떴다.
- **원인**: 5173에 MindAnchor가 `127.0.0.1`로 바인딩, 우리 vite는 다른 스택(::1)에 공존. 브라우저가 `localhost`를 **IPv4(127.0.0.1)** 로 풀어 MindAnchor에 연결됨. (vite 기본 host는 ::1만 잡기도 함 → `127.0.0.1` 접속 거부되는 반대 케이스도 겪음)
- **해결**: 우리 앱을 **`--port 5180 --strictPort --host 127.0.0.1`** 로 고정. 접속은 **`http://127.0.0.1:5180`** (localhost 말고 IP 명시).
- **교훈**: 여러 vite가 떠 있으면 포트+호스트를 명시 고정. IPv4/IPv6 localhost 해석 차이 주의.

---

## 5. 로그인 실패 — "The string did not match the expected pattern" → 403

가장 오래 걸린 문제. 단계적으로 드러남.

### 5-1. 오해: Safari `atob` 에러
- "The string did not match the expected pattern" = **Safari/WebKit의 `atob`(base64 디코드) DOMException 메시지**. JWT 디코드를 의심해 padding/UTF-8 보강했으나 진짜 원인 아님.

### 5-2. 계측이 또 터짐
- `catch (e) { e.message = ... }` → **`TypeError: Attempted to assign to readonly property`**. Safari에선 DOMException의 `message`가 **readonly**. → 계측은 `throw new Error(...)`로 감싸야 함. (역으로 원본 에러가 DOMException임을 확인)

### 5-3. 진짜 원인 1 — 남은 토큰이 로그인 요청에 딸려감
- `localStorage`에 남은 (무효) 토큰을 `Authorization: Bearer`로 **모든 요청에** 붙임.
- 백엔드 `JwtFilter`가 anonymous 허용 엔드포인트(`/users/login`)에서도 토큰을 먼저 검증 → 실패 시 **302 → /login(HTML)**. fetch가 redirect를 따라가 HTML을 받고 `res.json()`이 터짐.
- **확인법(curl)**: Authorization 없음→200, 깨진 Bearer→302.
- **해결**: 로그인/회원가입 요청엔 **토큰을 절대 안 붙임**(`skipAuth`), 로그인 전 `localStorage.removeItem` + `client.js`가 비-JSON 응답을 읽기 쉬운 에러로 변환.

### 5-4. 진짜 원인 2 (최종) — 백엔드 CORS Origin 불일치
- 위까지 고쳤는데도 **403**. curl은 200인데 브라우저만 403.
- **확인법(curl 헤더 이분탐색)**: 헤더 없음→200, **`Origin: http://127.0.0.1:5180` 추가→403**.
- **원인**: 백엔드 CORS가 **`http://localhost:3000`만 허용**(`custom.baseUrl`). 브라우저는 POST에 `Origin`을 붙이는데 우리 프론트 오리진(`127.0.0.1:5180`)이 허용 목록에 없어 **Spring CORS가 403**. (curl은 Origin이 없어 통과)
- **해결**: vite 프록시가 백엔드로 넘길 때 **`Origin`을 `http://localhost:3000`으로 교체**.
  ```js
  // vite.config.js
  proxy: { '/api': {
    target: 'http://localhost:8080', changeOrigin: true,
    configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('Origin', 'http://localhost:3000')),
  }}
  ```
- **근본 개선(백엔드)**: CORS 허용 오리진에 실제 프론트 오리진을 포함하거나, 프론트를 `localhost:3000`에서 띄우기.

---

## 6. S3 업로드 전부 실패 → AWS 계정 만료, 새 계정으로 재발급 (2026-06-15)

- **증상**: 에셋 등록/모델 업로드 시 `STORAGE_WRITE_FAILED("s3 파일 전송에 실패")`. 썸네일조차 안 올라감.
- **1차 진단**: `.env`의 S3 키로 직접 PutObject(boto3) → `InvalidAccessKeyId: The AWS Access Key Id you provided does not exist`. = 앱 무관, **키 자체가 무효**.
- **실제 원인**: **AWS 계정이 만료**됨(키 회전 아님). → 새 AWS 계정 생성 + 결제 등록.
- **새로 발급한 것**(콘솔에서):
  1. **S3 버킷** `teabag-assetbox` (region `ap-northeast-2`, Block all public access ON, SSE-S3, 버전관리/Object Lock off)
  2. **버킷 CORS** (3D 뷰어가 모델을 fetch하려면 필수 — 썸네일 `<img>`는 CORS 없이도 됨):
     ```json
     [{"AllowedHeaders":["*"],"AllowedMethods":["GET"],"AllowedOrigins":["http://localhost:3000","http://127.0.0.1:3000"],"ExposeHeaders":["ETag"]}]
     ```
  3. **IAM 정책**(이 버킷만 RW, 최소권한) — ARN은 **실제 버킷명**으로(`<...>` 꺾쇠 빼기, `assetbox-s3`로 오타냈다가 `NoSuchBucket`/`AccessDenied` 겪음):
     ```json
     {"Version":"2012-10-17","Statement":[
       {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::teabag-assetbox/*"},
       {"Effect":"Allow","Action":["s3:ListBucket"],"Resource":"arn:aws:s3:::teabag-assetbox"}]}
     ```
  4. **IAM 유저** `assetbox-app`(콘솔 접근 X) → 위 정책 연결 → **액세스 키** 발급(use case는 아무거나, "Local code" 추천 — 키 자체는 동일).
- **해결**: `team/.env.development`·`.env.production`의 `s3BucketName/s3AccessKey/s3SecretKey/s3Region` 교체 → 백엔드 재시작.
- **함정/메모**:
  - 앱은 `.env` 키 **한 세트**만 읽음 → 팀원 공유는 같은 키를 비공개로 (사람별 키 불필요, 학생 규모).
  - IAM 정책 ARN ≠ 실제 버킷명이면 키는 유효해도 `AccessDenied`. 셋(버킷명·정책ARN·.env)이 **한 글자도 안 틀리게** 일치해야 함.
  - 암호화 KMS 금지(SSE-S3) — KMS면 IAM에 KMS 권한도 필요해 업로드 깨짐.
  - 백엔드 모델 확장자: `FileValidator`가 현재 **`fbx`만** 허용(`glb/obj` 주석). 테스트는 진짜 `.fbx`로(랜덤바이트 .fbx는 `FBXLoader: Cannot find version number`).
  - 검증법: boto3로 PutObject/GetObject 직접 테스트해 키·버킷·정책 확인 후 앱 연결.

---

## 7. 에셋 등록 실패 원인 정정 (`POST /api/posts`) (2026-06-23 갱신)

> 과거에는 인증/CORS 문제로 추정했지만, 현재 확인한 핵심 원인은 프론트와 백엔드의 multipart 계약 불일치였다.

**증상**: 프론트에서 에셋 등록 시 `POST /api/posts`가 실패했다.

**확정된 사실**:
- 백엔드 `PostController`는 `POST /api/posts`에서 `request`, `thumbnail`, `assets` 파트를 모두 요구한다.
- 기존 프론트는 `request`, `thumbnail`만 보내고 모델 파일은 이후 `/files/upload`로 별도 전송하려 했다.
- 이 때문에 백엔드 로그에 `Required part 'assets' is not present`가 발생했다.
- `assets` 파트를 포함하고, 유효한 `categoryId`를 넣은 요청은 `201 Created`로 성공했다.
- S3 업로드, 에셋 상세 조회, 파일 presigned URL 조회, presigned GET 다운로드까지 확인했다.

**해결**:
- `postApi.create()`가 `assets` 파일 파트를 함께 보내도록 수정.
- `CreateAssetPage`에서 모델 파일을 필수로 받고, 현재 백엔드 정책에 맞춰 `.fbx`만 선택 가능하게 수정.
- 별도 `/files/upload` 호출은 제거.
- Docker 프론트 nginx의 기본 업로드 제한(1MB)을 넘는 `.fbx`가 `413` HTML 응답을 만들 수 있어 `client_max_body_size 25m`를 설정.
- 프론트 API 클라이언트가 비JSON 에러를 무조건 세션 만료로 오역하지 않도록 수정.

---

## 핵심 교훈 요약

0. **"재시작하면 깨짐 / 한 번은 되고 두 번째부터 안 됨"** → 백엔드가 자꾸 재시작되며 `create-drop`으로 DB가 비는지 의심. **PID/uptime + `users` 테이블**을 확인. (#7)
1. **`curl은 되는데 브라우저는 안 될 때**" → 브라우저만 보내는 것(Origin/Cookie/Authorization 헤더)을 의심. curl에 헤더를 하나씩 추가해 이분탐색. **단, "내 테스트는 로그인 직후 바로 호출"이라 재시작-유저증발을 못 잡을 수 있음**에 주의.
2. 에러 메시지가 난해하면(특히 Safari) → **발생 단계를 태깅**해 좁히되, `e.message` 재할당 금지(readonly).
3. 앱 켜둔 채 `gradlew test` 금지(dev DB 날아감).
4. 로컬 MySQL 비번은 `.env.production`에 맞추고, DB는 utf8mb4.
5. 여러 vite 동시 실행 시 포트/호스트 명시 고정 + `http://127.0.0.1:PORT`로 접속.

## 빠른 기동 절차 (2026-06-16 갱신)
```bash
# 1) Redis(docker)·MySQL(brew) 떠 있는지 확인
# 2) 백엔드 (IntelliJ Run 또는 bootRun) — :8080
#    ※ ddl-auto: update (재시작해도 DB 유지). 운영은 validate.
cd team && ./gradlew bootRun
# 3) 프론트 — vite.config.js에 port 3000 고정(Origin 꼼수 제거됨)
cd teabag-front && npm run dev                  # http://localhost:3000
# 4) 브라우저: http://localhost:3000
#    로그인: wjdtn747@naver.com / wjdtn3902  (영구 슈퍼어드민)
#    ⚠️ 앱 켜둔 채 gradlew test ❌ / 백엔드 자주 재시작 시 토큰 무효될 수 있음 → 재로그인
```

## 환경 빠른 참조
- **프론트**: http://localhost:3000 (vite, `/api`→8080 프록시, Origin 꼼수 없음)
- **백엔드**: :8080, `ddl-auto: update`
- **로그인(영구)**: `wjdtn747@naver.com` / `wjdtn3902` (SUPER_ADMIN 시드)
- **S3**: 버킷 `teabag-assetbox`(ap-northeast-2), IAM 유저 `assetbox-app`, 키는 `team/.env.*`
- **S3 버킷 CORS**: `localhost:3000`/`127.0.0.1:3000` GET 허용 (3D 뷰어용)
- **모델 확장자**: 현재 `.fbx`만(백엔드 FileValidator) / 테스트용: `~/Desktop/test-model.fbx`(three.js 삼바, 3.5MB)
- **주의**: 토큰 만료/유저 없음 상태에서는 302 응답이 CORS처럼 보일 수 있음 (이슈 Asset-Box#109)
