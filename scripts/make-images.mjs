// 단어 이미지 생성: Claude API 로 단어마다 SVG 그림을 만들어 R2 의 image/v1/<id>.svg 에 올린다.
// 필요한 것: DATABASE_URL, ANTHROPIC_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
// 선택: IMAGE_LIMIT (한 번 실행에 만들 최대 개수, 기본 20), IMAGE_MODEL (기본 claude-opus-5-5)
// 이미 만든 단어는 image/v1/_done.json 에 적어 두고 건너뛴다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import postgres from 'postgres';
import { checkSvg, extractSvg } from './svg-check.mjs';

const BUCKET = 'haru-english-media';
const MANIFEST = 'image/v1/_done.json';
const LIMIT = Number(process.env.IMAGE_LIMIT ?? 20);
const MODEL = process.env.IMAGE_MODEL ?? 'claude-opus-5-5';
const CONCURRENCY = 4;
const wrangler = join(process.cwd(), 'node_modules/.bin/wrangler');
const work = mkdtempSync(join(tmpdir(), 'images-'));
mkdirSync(join(work, 'image/v1'), { recursive: true });

const r2 = (...args) => execFileSync(wrangler, ['r2', 'object', ...args, '--remote'], { stdio: ['ignore', 'pipe', 'pipe'] });
function readManifest() {
  const file = join(work, 'done.json');
  try {
    r2('get', `${BUCKET}/${MANIFEST}`, '--file', file);
    return new Set(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return new Set(); // 처음 실행
  }
}
function writeManifest(done) {
  const file = join(work, 'done.json');
  writeFileSync(file, JSON.stringify([...done].sort((a, b) => a - b)));
  r2('put', `${BUCKET}/${MANIFEST}`, '--file', file, '--content-type', 'application/json');
}

const SYSTEM = `You draw small spot illustrations for an English vocabulary app. For each word you get, reply with one SVG and nothing else.

The picture helps a Korean learner remember the word, so show the meaning as a concrete scene or object. For an abstract word, show a situation where a person would use it, taken from the example sentence.

Every illustration shares one look so the set feels like a single hand drew it:
- Root element exactly: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 353 196">
- No background rectangle. The app places the picture on a light gray panel in light mode and a dark gray panel in dark mode, so it has to read on both.
- Flat shapes with rounded corners and rounded line caps. No gradients, filters, shadows or outlines around every shape.
- Four colors only: #8E8E99 for main shapes, #C4C4CC for secondary shapes, #FFFFFF for highlights, and #FF5A1F as the single accent on the one thing the word is about.
- Simple geometric people when people are needed: a circle head and a rounded body, no faces.
- Leave generous empty space; keep the subject within the middle 70% of the canvas.
- No letters, numbers or words anywhere, because the learner should not be able to read the answer off the picture.
- Only these elements: svg, g, path, rect, circle, ellipse, line, polyline, polygon. No text, style, image, use, links or scripts, and no id, href or event attributes.
- Under 60 shapes.`;

const client = new Anthropic();

async function draw(word) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: `Word: ${word.word}\nKorean meaning: ${word.meaning}\nExample sentence: ${word.example}` }],
  });
  if (response.stop_reason === 'refusal') return { error: '거절됨' };
  if (response.stop_reason === 'max_tokens') return { error: '출력이 잘림' };
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const svg = extractSvg(text);
  const problem = checkSvg(svg);
  return problem ? { error: problem } : { svg, usage: response.usage };
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const words = await sql`select id, word, meaning, example from words order by id`;
await sql.end();

const done = readManifest();
const todo = words.filter(w => !done.has(w.id)).slice(0, LIMIT);
console.log(`단어 ${words.length}개 중 ${done.size}개 완료. 이번에 ${todo.length}개를 만듭니다 (모델 ${MODEL}).`);

let made = 0, failed = 0, inTok = 0, outTok = 0, stop = false;
async function worker() {
  while (todo.length && !stop) {
    const word = todo.shift();
    try {
      let result = await draw(word);
      if (result.error) result = await draw(word); // 형식이 어긋나면 한 번만 다시 시도
      if (result.error) { failed++; console.log(`  건너뜀 ${word.word}: ${result.error}`); continue; }
      const key = `image/v1/${word.id}.svg`;
      writeFileSync(join(work, key), result.svg);
      r2('put', `${BUCKET}/${key}`, '--file', join(work, key), '--content-type', 'image/svg+xml');
      done.add(word.id);
      made++; inTok += result.usage.input_tokens; outTok += result.usage.output_tokens;
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) { stop = true; console.error('ANTHROPIC_API_KEY 가 올바르지 않습니다.'); }
      else if (error instanceof Anthropic.RateLimitError) { stop = true; console.error('요청 한도에 걸려 여기서 멈춥니다. 다음 실행에서 이어집니다.'); }
      else if (error instanceof Anthropic.APIError) { failed++; console.log(`  건너뜀 ${word.word}: API 오류 ${error.status}`); }
      else throw error;
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
if (made) writeManifest(done);
console.log(`이미지 ${made}개 생성, ${failed}개 건너뜀. 사용 토큰: 입력 ${inTok}, 출력 ${outTok}. 남은 단어 ${words.length - done.size}개.`);
