// 학습 콘텐츠 적재: DATABASE_URL=postgres://... node scripts/seed.mjs
// content/*.json 을 themes / words 에 넣는다. 이미 있는 단어는 뜻과 예문만 갱신하므로 학습 기록은 유지된다.
import { readFileSync, readdirSync } from 'node:fs';
import postgres from 'postgres';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 이 필요합니다.'); process.exit(1); }
const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = new URL('../content/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
let themeCount = 0, wordCount = 0;
await sql.begin(async tx => {
  const order = { business: 0, general: 0 };
  for (const f of files) {
    const data = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const t of data.themes) {
      const sort = ++order[data.track];
      const [theme] = await tx`
        insert into themes (track, level, name, sort_order) values (${data.track}, ${t.level ?? null}, ${t.name}, ${sort})
        on conflict (track, name) do update set level = excluded.level, sort_order = excluded.sort_order returning id`;
      themeCount++;
      for (const [i, w] of t.words.entries()) {
        await tx`
          insert into words (theme_id, word, meaning, example, example_ko, sort_order)
          values (${theme.id}, ${w.word}, ${w.meaning}, ${w.example}, ${w.example_ko}, ${i + 1})
          on conflict (theme_id, word) do update set meaning = excluded.meaning, example = excluded.example, example_ko = excluded.example_ko, sort_order = excluded.sort_order`;
        wordCount++;
      }
    }
  }
});
console.log(`주제 ${themeCount}개, 단어 ${wordCount}개 적재 완료`);
await sql.end();
