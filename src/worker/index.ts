import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import postgres from 'postgres';
import { LOGIN_ID, hashPassword, newToken, sha256, validPassword, verifyPassword } from './auth';
import { COURSES, KINDS, type CourseMin, type Kind, addDays, grade, nextBox, streakOf, todayIn, weekdayIndex } from './srs';

type Env = {
  HYPERDRIVE: Hyperdrive;
  MEDIA: R2Bucket;
  AI?: Ai;
  ASSETS: Fetcher;
  TTS_MODEL?: string;
  IMAGE_MODEL?: string;
};
type User = {
  id: string;
  login_id: string;
  track: 'business' | 'general' | null;
  level: 'beginner' | 'intermediate' | 'advanced' | null;
  course_min: CourseMin;
  timezone: string;
};
type Ctx = { Bindings: Env; Variables: { sql: postgres.Sql; user: User } };

const SESSION_DAYS = 60;
const COOKIE = 'sid';
const WORD_COLS = ['id', 'theme_id', 'word', 'meaning', 'example', 'example_ko'] as const;

const app = new Hono<Ctx>();

// 요청마다 DB 클라이언트를 만든다. 실제 연결 풀은 Hyperdrive 가 관리한다.
app.use('*', async (c, next) => {
  const sql = postgres(c.env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: true, onnotice: () => {} });
  c.set('sql', sql);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(sql.end({ timeout: 5 }));
  }
});

// 다른 출처에서 온 변경 요청은 받지 않는다.
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET') {
    const origin = c.req.header('origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: '허용되지 않은 요청입니다.' }, 403);
  }
  await next();
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: '서버에서 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' }, 500);
});

const publicUser = (u: User) => ({ loginId: u.login_id, track: u.track, level: u.level, courseMin: u.course_min });

async function startSession(c: any, userId: string) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await c.var.sql`insert into auth_sessions (token_hash, user_id, expires_at) values (${await sha256(token)}, ${userId}, ${expires})`;
  setCookie(c, COOKIE, token, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', expires });
}

async function readJson(c: any): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

/* ---------- 계정 ---------- */

app.post('/api/auth/signup', async c => {
  const body = await readJson(c);
  const loginId = String(body.loginId ?? '').trim().toLowerCase();
  if (!LOGIN_ID.test(loginId)) return c.json({ error: '아이디는 영문 소문자, 숫자, 밑줄로 4~20자여야 합니다.' }, 400);
  if (!validPassword(body.password)) return c.json({ error: '비밀번호는 8자 이상 72자 이하여야 합니다.' }, 400);
  const hash = await hashPassword(body.password);
  const rows = await c.var.sql<User[]>`
    insert into users (login_id, password_hash) values (${loginId}, ${hash})
    on conflict (login_id) do nothing returning id, login_id, track, level, course_min, timezone`;
  if (!rows.length) return c.json({ error: '이미 사용 중인 아이디입니다.' }, 409);
  await startSession(c, rows[0].id);
  return c.json({ user: publicUser(rows[0]) });
});

app.post('/api/auth/login', async c => {
  const body = await readJson(c);
  const loginId = String(body.loginId ?? '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const rows = await c.var.sql<(User & { password_hash: string })[]>`
    select id, login_id, track, level, course_min, timezone, password_hash from users where login_id = ${loginId}`;
  const ok = rows.length ? await verifyPassword(password, rows[0].password_hash) : false;
  if (!ok) return c.json({ error: '아이디 또는 비밀번호가 맞지 않습니다.' }, 401);
  await startSession(c, rows[0].id);
  return c.json({ user: publicUser(rows[0]) });
});

app.post('/api/auth/logout', async c => {
  const token = getCookie(c, COOKIE);
  if (token) await c.var.sql`delete from auth_sessions where token_hash = ${await sha256(token)}`;
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// 이 아래는 로그인이 필요하다.
const requireUser = async (c: any, next: () => Promise<void>) => {
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ error: '로그인이 필요합니다.' }, 401);
  const rows = await c.var.sql<User[]>`
    select u.id, u.login_id, u.track, u.level, u.course_min, u.timezone
    from auth_sessions s join users u on u.id = s.user_id
    where s.token_hash = ${await sha256(token)} and s.expires_at > now()`;
  if (!rows.length) return c.json({ error: '로그인이 필요합니다.' }, 401);
  c.set('user', rows[0]);
  await next();
};
app.use('/api/*', requireUser);
app.use('/media/*', requireUser);

app.get('/api/me', c => c.json({ user: publicUser(c.var.user) }));

app.put('/api/me', async c => {
  const body = await readJson(c);
  const u = c.var.user;
  let { track, level, course_min } = u;
  if (body.track === 'business') [track, level] = ['business', null];
  if (body.track === 'general') {
    if (!['beginner', 'intermediate', 'advanced'].includes(String(body.level))) return c.json({ error: '수준을 골라 주세요.' }, 400);
    [track, level] = ['general', body.level as User['level']];
  }
  if (body.courseMin !== undefined) {
    if (!(Number(body.courseMin) in COURSES)) return c.json({ error: '코스는 10, 20, 30분 중 하나여야 합니다.' }, 400);
    course_min = Number(body.courseMin) as CourseMin;
  }
  const rows = await c.var.sql<User[]>`
    update users set track = ${track}, level = ${level}, course_min = ${course_min} where id = ${u.id}
    returning id, login_id, track, level, course_min, timezone`;
  return c.json({ user: publicUser(rows[0]) });
});

/* ---------- 오늘의 학습 ---------- */

type WordRow = { id: number; theme_id: number; word: string; meaning: string; example: string; example_ko: string };
const wordDto = (w: WordRow) => ({ id: w.id, themeId: w.theme_id, word: w.word, meaning: w.meaning, example: w.example, exampleKo: w.example_ko });

async function plan(sql: postgres.Sql, u: User, courseMin: CourseMin) {
  const today = todayIn(u.timezone);
  const course = COURSES[courseMin];
  const due = await sql<WordRow[]>`
    select ${sql(WORD_COLS.map(k => 'w.' + k))} from user_words uw join words w on w.id = uw.word_id
    where uw.user_id = ${u.id} and uw.due_on <= ${today} order by uw.due_on, w.id limit ${course.reviews}`;
  const news = u.track
    ? await sql<(WordRow & { theme_name: string })[]>`
        select ${sql(WORD_COLS.map(k => 'w.' + k))}, t.name as theme_name from words w join themes t on t.id = w.theme_id
        where t.track = ${u.track} and t.level is not distinct from ${u.level}
          and not exists (select 1 from user_words uw where uw.user_id = ${u.id} and uw.word_id = w.id)
        order by t.sort_order, w.sort_order limit ${course.news}`
    : [];
  return { today, due, news, themeName: news[0]?.theme_name ?? '복습' };
}

app.get('/api/today', async c => {
  const { sql, user: u } = c.var;
  const p = await plan(sql, u, u.course_min);
  const days = (await sql<{ day: string }[]>`select to_char(day, 'YYYY-MM-DD') as day from study_days where user_id = ${u.id} order by day desc limit 400`).map(r => r.day);
  const monday = addDays(p.today, -weekdayIndex(p.today));
  const [counts] = await sql<{ learned: number; total: number }[]>`
    select (select count(*)::int from user_words where user_id = ${u.id}) as learned,
           (select count(*)::int from words w join themes t on t.id = w.theme_id
             where t.track = ${u.track ?? ''} and t.level is not distinct from ${u.level}) as total`;
  return c.json({
    today: p.today,
    streak: streakOf(days, p.today),
    doneToday: days.includes(p.today),
    week: Array.from({ length: 7 }, (_, i) => ({ day: addDays(monday, i), done: days.includes(addDays(monday, i)) })),
    themeName: p.themeName,
    news: p.news.map(wordDto),
    dueCount: p.due.length,
    learned: counts.learned,
    total: counts.total,
    courseMin: u.course_min,
  });
});

app.post('/api/sessions', async c => {
  const { sql, user: u } = c.var;
  const body = await readJson(c);
  const courseMin = (Number(body.courseMin) in COURSES ? Number(body.courseMin) : u.course_min) as CourseMin;
  const p = await plan(sql, u, courseMin);
  let reviews = p.due;
  let free = false;
  if (!reviews.length && !p.news.length) {
    // 새 단어도 복습할 단어도 없으면 배운 단어 중 10개를 자유 복습한다. 기억 단계는 바뀌지 않는다.
    free = true;
    reviews = await sql<WordRow[]>`
      select ${sql(WORD_COLS.map(k => 'w.' + k))} from user_words uw join words w on w.id = uw.word_id
      where uw.user_id = ${u.id} order by random() limit 10`;
  }
  const themeIds = [...new Set([...reviews, ...p.news].map(w => w.theme_id))];
  const pool = themeIds.length
    ? await sql<{ id: number; theme_id: number; word: string; meaning: string }[]>`select id, theme_id, word, meaning from words where theme_id in ${sql(themeIds)}`
    : [];
  const [row] = await sql<{ id: string }[]>`
    insert into study_sessions (user_id, day, course_min, theme_name, new_count, review_count)
    values (${u.id}, ${p.today}, ${courseMin}, ${p.themeName}, ${p.news.length}, ${reviews.length}) returning id`;
  return c.json({
    id: row.id,
    free,
    themeName: p.themeName,
    news: p.news.map(wordDto),
    reviews: reviews.map(wordDto),
    pool: pool.map(w => ({ id: w.id, themeId: w.theme_id, word: w.word, meaning: w.meaning })),
  });
});

app.post('/api/sessions/:id/answers', async c => {
  const { sql, user: u } = c.var;
  const body = await readJson(c);
  const kind = body.kind as Kind;
  const wordId = Number(body.wordId);
  if (!KINDS.includes(kind) || !Number.isInteger(wordId)) return c.json({ error: '요청 형식이 잘못되었습니다.' }, 400);
  const [session] = await sql<{ id: string; day: string }[]>`
    select id, to_char(day, 'YYYY-MM-DD') as day from study_sessions where id = ${c.req.param('id')} and user_id = ${u.id} and completed_at is null`;
  if (!session) return c.json({ error: '진행 중인 세트를 찾을 수 없습니다.' }, 404);
  const [word] = await sql<WordRow[]>`select ${sql(WORD_COLS)} from words where id = ${wordId}`;
  if (!word) return c.json({ error: '단어를 찾을 수 없습니다.' }, 404);
  const today = todayIn(u.timezone);

  if (kind === 'learn') {
    await sql`
      insert into user_words (user_id, word_id, box, due_on, learned_on) values (${u.id}, ${wordId}, 1, ${addDays(today, 1)}, ${today})
      on conflict (user_id, word_id) do nothing`;
    return c.json({ correct: true });
  }

  const correct = grade(kind, body.answer, word);
  if (body.retry !== true) {
    await sql`update study_sessions set first_total = first_total + 1, first_correct = first_correct + ${correct ? 1 : 0} where id = ${session.id}`;
    // 복습일이 된 단어만 기억 단계를 옮긴다. 오늘 배운 단어와 자유 복습은 그대로 둔다.
    const [uw] = await sql<{ box: number }[]>`
      select box from user_words where user_id = ${u.id} and word_id = ${wordId} and due_on <= ${today} and learned_on < ${today}`;
    if (uw) {
      const n = nextBox(uw.box, correct);
      await sql`update user_words set box = ${n.box}, due_on = ${addDays(today, n.days)}, updated_at = now() where user_id = ${u.id} and word_id = ${wordId}`;
    }
  }
  return c.json({ correct });
});

app.post('/api/sessions/:id/complete', async c => {
  const { sql, user: u } = c.var;
  const today = todayIn(u.timezone);
  const rows = await sql<{ first_total: number; first_correct: number; new_count: number; review_count: number; minutes: number }[]>`
    update study_sessions set completed_at = coalesce(completed_at, now()) where id = ${c.req.param('id')} and user_id = ${u.id}
    returning first_total, first_correct, new_count, review_count, greatest(1, round(extract(epoch from (completed_at - started_at)) / 60))::int as minutes`;
  if (!rows.length) return c.json({ error: '세트를 찾을 수 없습니다.' }, 404);
  await sql`insert into study_days (user_id, day) values (${u.id}, ${today}) on conflict do nothing`;
  const days = (await sql<{ day: string }[]>`select to_char(day, 'YYYY-MM-DD') as day from study_days where user_id = ${u.id} order by day desc limit 400`).map(r => r.day);
  const s = rows[0];
  return c.json({
    accuracy: s.first_total ? Math.round((s.first_correct / s.first_total) * 100) : 100,
    newCount: s.new_count,
    reviewCount: s.review_count,
    minutes: s.minutes,
    streak: streakOf(days, today),
  });
});

/* ---------- 단어장과 기록 ---------- */

app.get('/api/words', async c => {
  const { sql, user: u } = c.var;
  const rows = await sql<(WordRow & { theme_name: string; box: number | null; due_on: string | null })[]>`
    select ${sql(WORD_COLS.map(k => 'w.' + k))}, t.name as theme_name, uw.box, to_char(uw.due_on, 'YYYY-MM-DD') as due_on
    from words w join themes t on t.id = w.theme_id
    left join user_words uw on uw.word_id = w.id and uw.user_id = ${u.id}
    where (t.track = ${u.track ?? ''} and t.level is not distinct from ${u.level}) or uw.user_id is not null
    order by t.track, t.sort_order, w.sort_order`;
  const themes: { id: number; name: string; words: unknown[] }[] = [];
  for (const r of rows) {
    let t = themes[themes.length - 1];
    if (!t || t.id !== r.theme_id) themes.push((t = { id: r.theme_id, name: r.theme_name, words: [] }));
    t.words.push({ ...wordDto(r), box: r.box ?? 0, dueOn: r.due_on });
  }
  return c.json({ today: todayIn(u.timezone), themes });
});

app.get('/api/records', async c => {
  const { sql, user: u } = c.var;
  const today = todayIn(u.timezone);
  const q = c.req.query('month');
  const month = q && /^\d{4}-\d{2}$/.test(q) ? q : today.slice(0, 7);
  const days = await sql<{ day: string }[]>`
    select to_char(day, 'YYYY-MM-DD') as day from study_days where user_id = ${u.id} and to_char(day, 'YYYY-MM') = ${month} order by day`;
  const sessions = await sql<{ day: string; theme_name: string; new_count: number; review_count: number; first_total: number; first_correct: number }[]>`
    select to_char(day, 'YYYY-MM-DD') as day, theme_name, new_count, review_count, first_total, first_correct
    from study_sessions where user_id = ${u.id} and completed_at is not null order by completed_at desc limit 10`;
  return c.json({
    today,
    month,
    days: days.map(d => d.day),
    sessions: sessions.map(s => ({
      day: s.day,
      themeName: s.theme_name,
      newCount: s.new_count,
      reviewCount: s.review_count,
      accuracy: s.first_total ? Math.round((s.first_correct / s.first_total) * 100) : 100,
    })),
  });
});

/* ---------- 미디어 (R2) ---------- */

const mediaHeaders = (type: string) => ({ 'content-type': type, 'cache-control': 'private, max-age=31536000, immutable' });

async function toBytes(out: unknown, field: 'audio' | 'image'): Promise<Uint8Array | null> {
  if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (out instanceof Uint8Array) return out;
  const b64 = (out as Record<string, unknown> | null)?.[field];
  return typeof b64 === 'string' ? Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)) : null;
}

// 발음 음성: R2 에 있으면 그대로, 없으면 한 번 만들어 저장한다.
app.get('/media/audio/:id/:part', async c => {
  const id = Number(c.req.param('id'));
  const part = c.req.param('part');
  if (!Number.isInteger(id) || (part !== 'word' && part !== 'example')) return c.notFound();
  const key = `audio/v1/${id}-${part}.mp3`;
  const hit = await c.env.MEDIA.get(key);
  if (hit) return new Response(hit.body, { headers: mediaHeaders('audio/mpeg') });
  if (!c.env.AI) return c.notFound();
  const [word] = await c.var.sql<{ word: string; example: string }[]>`select word, example from words where id = ${id}`;
  if (!word) return c.notFound();
  const model = c.env.TTS_MODEL ?? '@cf/deepgram/aura-2-en';
  const out = await c.env.AI.run(model as any, { text: part === 'word' ? word.word : word.example, speaker: 'luna', encoding: 'mp3' } as any);
  const bytes = await toBytes(out, 'audio');
  if (!bytes?.length) return c.notFound();
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
  return new Response(bytes as BodyInit, { headers: mediaHeaders('audio/mpeg') });
});

// 단어 이미지: 예문 장면을 그림으로 만든다. 글자는 넣지 않는다.
app.get('/media/image/:id', async c => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.notFound();
  const key = `image/v1/${id}.jpg`;
  const hit = await c.env.MEDIA.get(key);
  if (hit) return new Response(hit.body, { headers: mediaHeaders('image/jpeg') });
  if (!c.env.AI) return c.notFound();
  const [word] = await c.var.sql<{ word: string; example: string }[]>`select word, example from words where id = ${id}`;
  if (!word) return c.notFound();
  const model = c.env.IMAGE_MODEL ?? '@cf/black-forest-labs/flux-1-schnell';
  const prompt = `Minimal flat editorial illustration of this scene: "${word.example}" Focus on the idea of "${word.word}". Soft warm light gray background, limited palette with one orange accent, simple shapes, generous empty space, no text, no letters, no words.`;
  const out = await c.env.AI.run(model as any, { prompt, steps: 4, seed: id } as any);
  const bytes = await toBytes(out, 'image');
  if (!bytes?.length) return c.notFound();
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  return new Response(bytes as BodyInit, { headers: mediaHeaders('image/jpeg') });
});

app.all('/api/*', c => c.json({ error: '없는 주소입니다.' }, 404));

export default app;
