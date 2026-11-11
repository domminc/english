// 학습 콘텐츠 JSON 검사: node scripts/validate-content.mjs [파일...]
import { readFileSync, readdirSync } from 'node:fs';
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync('content').filter(f => f.endsWith('.json')).map(f => 'content/' + f);
let errors = 0; const seen = new Map();
const err = m => { errors++; console.error('  ✗ ' + m); };
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`${file}: track=${data.track} themes=${data.themes.length} words=${data.themes.reduce((n, t) => n + t.words.length, 0)}`);
  if (!['business', 'general'].includes(data.track)) err('track 값이 잘못됨');
  for (const t of data.themes) {
    if (!t.name) err('주제 이름 없음');
    if (data.track === 'general' && !['beginner', 'intermediate', 'advanced'].includes(t.level)) err(`${t.name}: level 없음`);
    if (t.words.length !== 10) err(`${t.name}: 단어가 ${t.words.length}개 (10개여야 함)`);
    for (const w of t.words) {
      for (const k of ['word', 'meaning', 'example', 'example_ko']) if (!w[k] || typeof w[k] !== 'string') err(`${t.name}/${w.word}: ${k} 없음`);
      if (!w.example || !w.word) continue;
      if (!w.example.toLowerCase().includes(w.word.toLowerCase())) err(`${w.word}: 예문에 단어가 그대로 들어 있지 않음 → "${w.example}"`);
      const n = w.example.split(' ').length; if (n < 4 || n > 10) err(`${w.word}: 예문 단어 수 ${n} (4~10)`);
      if (/\s{2,}|^\s|\s$/.test(w.example)) err(`${w.word}: 예문 공백`);
      if (!/[.?!]$/.test(w.example)) err(`${w.word}: 예문 끝 문장부호 없음`);
      if (w.word !== w.word.toLowerCase() && !/^[A-Z]{2,}$/.test(w.word)) err(`${w.word}: 단어는 소문자`);
      const key = data.track + ':' + w.word.toLowerCase();
      if (seen.has(key)) err(`${w.word}: 중복 (${seen.get(key)} / ${file})`); else seen.set(key, file);
    }
  }
}
console.log(errors ? `오류 ${errors}건` : '모두 통과'); process.exit(errors ? 1 : 0);
