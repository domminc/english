// 배포 준비: Neon 프로젝트, R2 버킷, Hyperdrive 설정을 없으면 만들고 있으면 그대로 쓴다.
// 필요한 환경 변수: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NEON_API_KEY
// 결과: GITHUB_ENV 에 DATABASE_URL 을, GITHUB_OUTPUT 에 hyperdrive_id 를 쓴다. 비밀 값은 로그에 찍지 않는다.
import { appendFileSync } from 'node:fs';

const NAME = 'haru-english';
const BUCKET = 'haru-english-media';
const HYPERDRIVE = 'haru-english-db';
// 붙여 넣을 때 섞이기 쉬운 공백, 줄바꿈, 따옴표, "Bearer " 접두어를 걷어낸다.
const clean = v => (v ?? '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
const cfToken = clean(process.env.CLOUDFLARE_API_TOKEN), account = clean(process.env.CLOUDFLARE_ACCOUNT_ID), neonKey = clean(process.env.NEON_API_KEY);
const NEON_REGION = process.env.NEON_REGION || 'aws-ap-southeast-1';
// 값 자체는 찍지 않고, 어떤 종류의 값인지만 알려 준다.
const kind = /^napi_/.test(neonKey) ? 'Neon API 키 형식(napi_)' : /^postgres(ql)?:\/\//.test(neonKey) ? 'DB 연결 문자열 (API 키가 아님)' : /^npg_/.test(neonKey) ? 'DB 비밀번호 (API 키가 아님)' : /^sk-ant-/.test(neonKey) ? 'Claude API 키 (자리가 바뀜)' : '알 수 없는 형식';
console.log(`NEON_API_KEY: ${kind}, 길이 ${neonKey.length}${neonKey !== (process.env.NEON_API_KEY ?? '') ? ', 앞뒤 공백이나 따옴표를 걷어냄' : ''}`);
console.log(`CLOUDFLARE_ACCOUNT_ID: ${/^[0-9a-f]{32}$/.test(account) ? '형식 정상' : '32자리 16진수가 아님'}, CLOUDFLARE_API_TOKEN 길이 ${cfToken.length}`);
for (const [k, v] of Object.entries({ CLOUDFLARE_API_TOKEN: cfToken, CLOUDFLARE_ACCOUNT_ID: account, NEON_API_KEY: neonKey })) {
  if (!v) { console.error(`${k} 가 없습니다. 저장소 Settings → Secrets and variables → Actions 에 추가해 주세요.`); process.exit(1); }
}

async function call(base, token, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data, text };
}
const neon = (m, p, b) => call('https://console.neon.tech/api/v2', neonKey, m, p, b);
const cf = (m, p, b) => call(`https://api.cloudflare.com/client/v4/accounts/${account}`, cfToken, m, p, b);
// 응답 본문에는 비밀번호가 섞여 있을 수 있어 상태 코드와 오류 메시지만 남긴다.
const fail = (what, r) => { console.error(`${what} 실패 (HTTP ${r.status}): ${r.data?.message ?? r.data?.errors?.[0]?.message ?? '응답을 해석하지 못했습니다'}`); process.exit(1); };

/* 1. Neon */
let uri;
const list = await neon('GET', '/projects?limit=100');
if (!list.ok) fail('Neon 프로젝트 조회', list);
let project = list.data.projects?.find(p => p.name === NAME);
if (!project) {
  const made = await neon('POST', '/projects', { project: { name: NAME, region_id: NEON_REGION } });
  if (!made.ok) fail('Neon 프로젝트 생성', made);
  project = made.data.project;
  uri = made.data.connection_uris?.[0]?.connection_uri;
  console.log(`Neon 프로젝트를 만들었습니다 (${NEON_REGION}).`);
} else console.log('기존 Neon 프로젝트를 사용합니다.');
if (!uri) {
  const branches = await neon('GET', `/projects/${project.id}/branches`);
  if (!branches.ok) fail('Neon 브랜치 조회', branches);
  const branch = branches.data.branches.find(b => b.default || b.primary) ?? branches.data.branches[0];
  const dbs = await neon('GET', `/projects/${project.id}/branches/${branch.id}/databases`);
  if (!dbs.ok) fail('Neon 데이터베이스 조회', dbs);
  const db = dbs.data.databases[0];
  const got = await neon('GET', `/projects/${project.id}/connection_uri?database_name=${encodeURIComponent(db.name)}&role_name=${encodeURIComponent(db.owner_name)}`);
  if (!got.ok) fail('Neon 연결 문자열 조회', got);
  uri = got.data.uri;
}
const u = new URL(uri);
const password = decodeURIComponent(u.password);
if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${password}`), console.log(`::add-mask::${uri}`);

/* 2. R2 */
const bucket = await cf('POST', '/r2/buckets', { name: BUCKET });
if (bucket.ok) console.log('R2 버킷을 만들었습니다.');
else if (bucket.status === 409 || /already exists/i.test(bucket.text)) console.log('기존 R2 버킷을 사용합니다.');
else fail('R2 버킷 생성', bucket);

/* 3. Hyperdrive */
const origin = { scheme: 'postgres', host: u.hostname, port: Number(u.port || 5432), database: u.pathname.slice(1), user: decodeURIComponent(u.username), password };
const configs = await cf('GET', '/hyperdrive/configs');
if (!configs.ok) fail('Hyperdrive 조회', configs);
let hd = configs.data.result?.find(c => c.name === HYPERDRIVE);
if (hd) {
  const upd = await cf('PATCH', `/hyperdrive/configs/${hd.id}`, { origin });
  if (!upd.ok) fail('Hyperdrive 갱신', upd);
  console.log('기존 Hyperdrive 설정의 접속 정보를 갱신했습니다.');
} else {
  const made = await cf('POST', '/hyperdrive/configs', { name: HYPERDRIVE, origin });
  if (!made.ok) fail('Hyperdrive 생성', made);
  hd = made.data.result;
  console.log('Hyperdrive 설정을 만들었습니다.');
}

if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `DATABASE_URL=${uri}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `hyperdrive_id=${hd.id}\n`);
console.log(`Hyperdrive ID: ${hd.id}`);
