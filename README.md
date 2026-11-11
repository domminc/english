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

Postgres 가 `127.0.0.1:5433` 에 `haru` DB 로 떠 있어야 한다 (`wrangler.local.jsonc` 의 `localConnectionString`).

```sh
npm install
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/haru
npm run db:migrate
npm run db:seed
npm run dev        # http://localhost:8787
```

로컬 설정에는 Workers AI 바인딩이 없어서 음성과 이미지는 만들지 않는다. 발음은 브라우저 음성으로 대신 나온다.

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
| `CLOUDFLARE_API_TOKEN` | Workers Scripts 편집, R2 편집, Hyperdrive 편집, Workers AI 읽기 권한의 API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| `NEON_API_KEY` | Neon 계정 API 키 |

`main` 에 푸시하거나 Actions 화면에서 "배포" 를 직접 실행하면 `scripts/provision.mjs` 가 Neon 프로젝트(`haru-english`), R2 버킷(`haru-english-media`), Hyperdrive 설정(`haru-english-db`)을 없으면 만들고, 스키마와 콘텐츠를 적재한 뒤 Worker 를 배포한다. 토큰은 저장소 파일에 넣지 않는다.

## 미디어

`/media/audio/:id/word|example`, `/media/image/:id` 는 R2 에 파일이 있으면 그대로 내려주고, 없으면 Workers AI 로 한 번 만들어 R2 에 저장한다. 로그인한 사용자만 요청할 수 있다. 모델은 `TTS_MODEL`, `IMAGE_MODEL` 변수로 바꿀 수 있다.

## 학습 규칙

- 코스: 10 / 20 / 30분 = 새 단어 5 / 10 / 15개, 복습 최대 10 / 20 / 30개
- 맞힌 복습 단어는 한 단계 올라가 1 · 2 · 4 · 7 · 15 · 30일 뒤에 다시 나온다. 틀리면 1단계로 돌아가 다음 날 나온다.
- 오늘 배운 단어는 그날 몇 번을 풀어도 1단계에 머문다.
- 날짜는 사용자 시간대(기본 Asia/Seoul) 기준이다.
