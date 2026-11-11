// 발음 음성 목록: DB 의 단어와 예문을 "R2 키<TAB>읽을 문장" 형식으로 출력한다.
// DATABASE_URL=postgres://... node scripts/audio-list.mjs > audio.tsv
import postgres from 'postgres';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 이 필요합니다.'); process.exit(1); }
const sql = postgres(url, { max: 1, onnotice: () => {} });
const rows = await sql`select id, word, example from words order by id`;
for (const r of rows) {
  console.log(`audio/v1/${r.id}-word.mp3\t${r.word}`);
  console.log(`audio/v1/${r.id}-example.mp3\t${r.example}`);
}
await sql.end();
