// 대문 사이트에 richislet.com 과 www.richislet.com 을 연결한다.
// 식단 앱이 food.richislet.com 에서 열리는 것을 먼저 확인하고, 열리지 않으면 아무것도 바꾸지 않는다.
// 필요한 환경 변수: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
const SERVICE = 'richislet-portal';
const HOSTS = ['richislet.com', 'www.richislet.com'];
const FOOD_HEALTH = 'https://food.richislet.com/api/health';
const clean = v => (v ?? '').trim();
const token = clean(process.env.CLOUDFLARE_API_TOKEN), account = clean(process.env.CLOUDFLARE_ACCOUNT_ID);
const warn = m => console.log(`::warning::${m}`);

async function cf(method, path, body) {
  const res = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.success !== false, status: res.status, data, message: data?.errors?.[0]?.message ?? '' };
}

const food = await fetch(FOOD_HEALTH, { redirect: 'follow' }).then(r => r.ok, () => false);
if (!food) {
  warn('food.richislet.com 이 아직 열리지 않아 richislet.com 은 그대로 둡니다. 식단 앱을 새 주소로 배포한 뒤 이 배포를 다시 실행해 주세요.');
  process.exit(0);
}

const current = await cf('GET', `/accounts/${account}/workers/domains`);
if (!current.ok) { warn(`연결된 도메인 조회 실패 (HTTP ${current.status}): ${current.message}`); process.exit(0); }
const owner = h => current.data.result.find(d => d.hostname === h)?.service;

for (const hostname of HOSTS) {
  if (owner(hostname) === SERVICE) { console.log(`${hostname}: 이미 대문 사이트에 연결되어 있습니다.`); continue; }
  const before = owner(hostname) ?? '없음';
  // wrangler 가 쓰는 것과 같은 호출. 다른 Worker 에 붙어 있던 도메인과 DNS 레코드를 넘겨받는다.
  const res = await cf('PUT', `/accounts/${account}/workers/scripts/${SERVICE}/domains/records`, {
    override_scope: true,
    override_existing_origin: true,
    override_existing_dns_record: true,
    origins: [{ hostname }],
  });
  if (res.ok) console.log(`${hostname}: ${before} → ${SERVICE} 로 연결했습니다.`);
  else { warn(`${hostname} 연결 실패 (HTTP ${res.status}): ${res.message}`); process.exitCode = 1; }
}
