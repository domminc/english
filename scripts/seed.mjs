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
      // 주제 하나의 단어를 한 번에 넣는다.
      const rows = t.words.map((w, i) => ({ theme_id: theme.id, word: w.word, meaning: w.meaning, example: w.example, example_ko: w.example_ko, sort_order: i + 1 }));
      await tx`
        insert into words ${tx(rows, 'theme_id', 'word', 'meaning', 'example', 'example_ko', 'sort_order')}
        on conflict (theme_id, word) do update set meaning = excluded.meaning, example = excluded.example, example_ko = excluded.example_ko, sort_order = excluded.sort_order`;
      wordCount += rows.length;
    }
  }
});
console.log(`주제 ${themeCount}개, 단어 ${wordCount}개 적재 완료`);
await sql.end();
