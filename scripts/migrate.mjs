// 스키마 적용: DATABASE_URL=postgres://... node scripts/migrate.mjs
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 이 필요합니다.'); process.exit(1); }
const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
console.log('스키마 적용 완료');
await sql.end();
