import type { PoolWord, SessionPlan, Word } from './api';

export type Kind = 'learn' | 'mc' | 'cm' | 'blank' | 'listen' | 'type' | 'arr';
export type Item = {
  kind: Kind;
  word: Word;
  review?: boolean;
  retry?: boolean;
  /** 고르기 문제의 보기 */
  options?: { id: number; label: string }[];
  /** 문장 만들기의 섞인 타일 */
  tiles?: string[];
};

export const KIND_LABEL: Record<Kind, string> = {
  learn: '새 단어',
  mc: '뜻 고르기',
  cm: '단어 고르기',
  blank: '빈칸 채우기',
  listen: '듣고 고르기',
  type: '직접 쓰기',
  arr: '문장 만들기',
};

export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function options(word: Word, pool: PoolWord[], by: 'meaning' | 'word', rnd: () => number) {
  const same = shuffle(pool.filter(p => p.themeId === word.themeId && p.id !== word.id), rnd);
  const rest = shuffle(pool.filter(p => p.themeId !== word.themeId && p.id !== word.id), rnd);
  const picks = [...same, ...rest].slice(0, 3);
  return shuffle([{ id: word.id, label: word[by] }, ...picks.map(p => ({ id: p.id, label: p[by] }))], rnd);
}

export function prepare(item: Item, pool: PoolWord[], rnd: () => number = Math.random): Item {
  if (item.kind === 'mc' || item.kind === 'listen') return { ...item, options: options(item.word, pool, 'meaning', rnd) };
  if (item.kind === 'cm' || item.kind === 'blank') return { ...item, options: options(item.word, pool, 'word', rnd) };
  if (item.kind === 'arr') {
    const words = item.word.example.split(' ');
    let tiles = shuffle(words, rnd);
    if (words.length > 1 && tiles.join(' ') === words.join(' ')) tiles = words.slice().reverse();
    return { ...item, tiles };
  }
  return item;
}

/**
 * 한 세트의 문제 순서.
 * 복습 → (새 단어 5개씩: 카드, 뜻 고르기, 단어 고르기) → 새 단어 전체로 빈칸, 문장 만들기, 직접 쓰기.
 */
export function buildQueue(plan: SessionPlan, rnd: () => number = Math.random): Item[] {
  const reviewKinds: Kind[] = ['mc', 'cm', 'blank', 'type', 'arr', 'listen'];
  const q: Item[] = shuffle(plan.reviews, rnd).map(word => ({ kind: reviewKinds[Math.floor(rnd() * reviewKinds.length)], word, review: true }));
  for (let i = 0; i < plan.news.length; i += 5) {
    const chunk = plan.news.slice(i, i + 5);
    chunk.forEach(word => q.push({ kind: 'learn', word }));
    shuffle(chunk, rnd).forEach(word => q.push({ kind: 'mc', word }));
    shuffle(chunk, rnd).forEach(word => q.push({ kind: 'cm', word }));
  }
  (['blank', 'arr', 'type'] as Kind[]).forEach(kind => shuffle(plan.news, rnd).forEach(word => q.push({ kind, word })));
  return q.map(item => prepare(item, plan.pool, rnd));
}

export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** 화면에서 바로 정답 여부를 보여 주기 위한 채점. 기록은 서버가 다시 채점해 남긴다. */
export function isCorrect(item: Item, answer: number | string): boolean {
  if (item.kind === 'type') return typeof answer === 'string' && norm(answer) === norm(item.word.word);
  if (item.kind === 'arr') return typeof answer === 'string' && norm(answer) === norm(item.word.example);
  return answer === item.word.id;
}

/** 틀린 문제는 세트 끝에 다시 넣는다. 듣기 문제는 뜻 고르기로 바꿔 넣는다. */
export function retryOf(item: Item, pool: PoolWord[], rnd: () => number = Math.random): Item {
  return prepare({ kind: item.kind === 'listen' ? 'mc' : item.kind, word: item.word, retry: true }, pool, rnd);
}
