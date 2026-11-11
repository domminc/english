// 간격 반복과 채점. 순수 함수만 둔다.

/** 상자 번호(1~6)별 다음 복습까지의 일수 */
export const INTERVAL_DAYS = [0, 1, 2, 4, 7, 15, 30] as const;

export const COURSES = { 10: { news: 5, reviews: 10 }, 20: { news: 10, reviews: 20 }, 30: { news: 15, reviews: 30 } } as const;
export type CourseMin = keyof typeof COURSES;

export type Kind = 'learn' | 'mc' | 'cm' | 'blank' | 'listen' | 'type' | 'arr';
export const KINDS: Kind[] = ['learn', 'mc', 'cm', 'blank', 'listen', 'type', 'arr'];

export function nextBox(box: number, correct: boolean): { box: number; days: number } {
  const next = correct ? Math.min(6, box + 1) : 1;
  return { box: next, days: INTERVAL_DAYS[next] };
}

export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** 고르기 문제는 단어 id, 쓰기 문제는 글자를 비교한다. */
export function grade(kind: Kind, answer: unknown, word: { id: number; word: string; example: string }): boolean {
  if (kind === 'learn') return true;
  if (kind === 'type') return typeof answer === 'string' && norm(answer) === norm(word.word);
  if (kind === 'arr') return typeof answer === 'string' && norm(answer) === norm(word.example);
  return Number(answer) === word.id;
}

/** 시간대 기준 오늘 날짜(YYYY-MM-DD) */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 월요일 시작 요일 번호(0=월 … 6=일) */
export function weekdayIndex(day: string): number {
  return (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;
}

/** 학습한 날짜 목록에서 오늘(또는 어제)까지 이어진 연속 일수 */
export function streakOf(days: string[], today: string): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}
