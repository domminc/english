# 하루 한 장 영어

하루 10~30분, 영어 단어와 문장을 간격 반복으로 익히는 웹앱.

- 서버: Cloudflare Workers (Hono, TypeScript)
- DB: Neon Postgres, Worker 에서는 Hyperdrive 바인딩으로 접속
- 파일: R2 (발음 음성, 단어 이미지)
- 화면: React + Vite, 같은 Worker 의 정적 자산으로 배포

## 구조

| 경로 | 내용 |
| --- | --- |
| `src/worker/` | API (`index.ts`), 비밀번호·세션 (`auth.ts`), 간격 반복·채점 (`srs.ts`) |
| `src/web/` | 화면. `queue.ts` 가 한 세트의 문제 순서를 만든다 |
| `db/schema.sql` | 테이블 정의 |
| `content/*.json` | 학습 콘텐츠 (업무 영어 300단어, 일반 영어 초·중·고급 180단어) |
| `scripts/` | 스키마 적용, 콘텐츠 적재, 콘텐츠 검사 |

## 로컬 실행

Postgres 가 `127.0.0.1:5433` 에 `haru` DB 로 떠 있어야 한다 (`wrangler.jsonc` 의 `localConnectionString`).

```sh
npm install
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/haru
npm run db:migrate
npm run db:seed
npm run dev        # http://localhost:8787
```

로컬 R2 에는 음성 파일이 없어서 발음은 브라우저 음성으로 나온다.

## 검사

```sh
npm run typecheck
npm test
npm run content:check
```

## 배포

GitHub Actions 가 배포한다 (`.github/workflows/deploy.yml`). 저장소 Settings → Secrets and variables → Actions 에 세 값을 넣는다.

| Secret | 값 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts 편집, R2 편집, Hyperdrive 편집 권한의 API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| `NEON_API_KEY` | Neon 계정 API 키(`napi_...`), 또는 이미 만든 Neon DB 의 연결 문자열(`postgresql://...`) |
| `ANTHROPIC_API_KEY` | (선택) Claude API 키. 단어 이미지 생성에 쓴다 |

`main` 에 푸시하거나 Actions 화면에서 "배포" 를 직접 실행하면 `scripts/provision.mjs` 가 Neon 프로젝트(`haru-english`), R2 버킷(`haru-english-media`), Hyperdrive 설정(`haru-english-db`)을 없으면 만들고, 스키마와 콘텐츠를 적재한 뒤 Worker 를 배포한다. 토큰은 저장소 파일에 넣지 않는다.

## 대문 사이트 (richislet.com)

`portal/` 은 richislet.com 에 띄우는 카드형 대문 페이지다. 같은 배포 워크플로가 Worker `richislet-portal` 로 올리고, `scripts/portal-domains.mjs` 가 식단 앱이 `food.richislet.com` 에서 열리는 것을 확인한 뒤에만 `richislet.com` 과 `www.richislet.com` 을 대문으로 넘긴다. 카드를 추가하려면 `portal/public/index.html` 의 목록에 항목을 더한다.

## 미디어

- 발음 음성: 배포 때 `scripts/upload-audio.sh` 가 오픈소스 음성 합성기 Piper 로 단어와 예문 음성(MP3)을 만들어 R2 의 `audio/v1/` 에 올린다. 유료 서비스를 쓰지 않는다. 단어 목록이 바뀌지 않았으면 건너뛴다.
- 단어 이미지: Secret `ANTHROPIC_API_KEY` 가 있으면 배포 때 `scripts/make-images.mjs` 가 Claude API 로 단어마다 SVG 그림을 만들어 R2 의 `image/v1/<단어 id>.svg` 에 올린다. 한 번 실행에 `IMAGE_LIMIT` 개(기본 20)만 만들고 다음 실행에서 이어 간다. 저장소 Variable `IMAGE_LIMIT` 로 바꾼다. 그림이 없는 단어는 그 자리를 표시하지 않는다.
- `/media/*` 는 로그인한 사용자만 요청할 수 있다. 파일이 없으면 발음은 브라우저 음성으로 읽는다.

## 학습 규칙

- 코스: 10 / 20 / 30분 = 새 단어 5 / 10 / 15개, 복습 최대 10 / 20 / 30개
- 맞힌 복습 단어는 한 단계 올라가 1 · 2 · 4 · 7 · 15 · 30일 뒤에 다시 나온다. 틀리면 1단계로 돌아가 다음 날 나온다.
- 오늘 배운 단어는 그날 몇 번을 풀어도 1단계에 머문다.
- 날짜는 사용자 시간대(기본 Asia/Seoul) 기준이다.
