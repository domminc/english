import { describe, expect, it } from 'vitest';
import { addDays, grade, nextBox, streakOf, todayIn, weekdayIndex } from './srs';
import { buildQueue, isCorrect, retryOf } from '../web/queue';
import type { SessionPlan, Word } from '../web/api';

describe('간격 반복', () => {
  it('맞히면 한 단계 올라가고 간격이 1·2·4·7·15·30일로 늘어난다', () => {
    expect([1, 2, 3, 4, 5].map(b => nextBox(b, true))).toEqual([
      { box: 2, days: 2 },
      { box: 3, days: 4 },
      { box: 4, days: 7 },
      { box: 5, days: 15 },
      { box: 6, days: 30 },
    ]);
    expect(nextBox(6, true)).toEqual({ box: 6, days: 30 });
  });
  it('틀리면 1단계로 돌아가 내일 다시 나온다', () => {
    expect(nextBox(5, false)).toEqual({ box: 1, days: 1 });
  });
});

describe('날짜', () => {
  it('시간대 기준으로 오늘을 구한다', () => {
    const t = new Date('2026-11-10T16:30:00Z'); // 서울은 11일 01:30
    expect(todayIn('Asia/Seoul', t)).toBe('2026-11-11');
    expect(todayIn('America/Los_Angeles', t)).toBe('2026-11-10');
  });
  it('달과 해를 넘겨 더한다', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('월요일을 0으로 센다', () => {
    expect(weekdayIndex('2026-11-10')).toBe(1); // 화요일
    expect(weekdayIndex('2026-11-15')).toBe(6); // 일요일
  });
  it('연속 일수는 오늘 안 했어도 어제까지 이어졌으면 유지된다', () => {
    expect(streakOf(['2026-11-10', '2026-11-09', '2026-11-08'], '2026-11-10')).toBe(3);
    expect(streakOf(['2026-11-09', '2026-11-08'], '2026-11-10')).toBe(2);
    expect(streakOf(['2026-11-08'], '2026-11-10')).toBe(0);
    expect(streakOf([], '2026-11-10')).toBe(0);
  });
});

const word = (id: number, w: string, example: string): Word => ({ id, themeId: 1, word: w, meaning: w + ' 뜻', example, exampleKo: '해석' });

describe('채점', () => {
  const w = { id: 7, word: 'check in', example: 'We can check in after three.' };
  it('고르기 문제는 단어 id 로 비교한다', () => {
    expect(grade('mc', 7, w)).toBe(true);
    expect(grade('blank', 8, w)).toBe(false);
  });
  it('쓰기 문제는 대소문자와 공백 차이를 무시한다', () => {
    expect(grade('type', '  Check   In ', w)).toBe(true);
    expect(grade('type', 'checkin', w)).toBe(false);
    expect(grade('arr', 'we can check in after three.', w)).toBe(true);
    expect(grade('arr', 'We can check after in three.', w)).toBe(false);
  });
  it('화면의 채점과 서버의 채점이 같다', () => {
    const item = { kind: 'type' as const, word: word(7, 'check in', w.example) };
    for (const a of ['check in', 'Check In', 'check', '']) expect(isCorrect(item, a)).toBe(grade('type', a, w));
  });
});

describe('문제 순서', () => {
  const news = [1, 2, 3, 4, 5, 6].map(i => word(i, 'new' + i, `This is new${i} here.`));
  const reviews = [11, 12].map(i => word(i, 'old' + i, `That was old${i} there.`));
  const plan: SessionPlan = { id: 's', free: false, themeName: '회의', news, reviews, pool: [...news, ...reviews] };
  const q = buildQueue(plan);

  it('복습이 먼저 나오고, 새 단어는 카드를 본 뒤에 문제로 나온다', () => {
    expect(q.slice(0, 2).every(i => i.review)).toBe(true);
    for (const w of news) {
      const first = q.findIndex(i => i.word.id === w.id);
      expect(q[first].kind).toBe('learn');
    }
  });
  it('새 단어마다 카드 1장과 문제 5개가 나온다', () => {
    expect(q.length).toBe(reviews.length + news.length * 6);
    for (const w of news) expect(q.filter(i => i.word.id === w.id).map(i => i.kind).sort()).toEqual(['arr', 'blank', 'cm', 'learn', 'mc', 'type']);
  });
  it('보기는 4개이고 정답이 한 번만 들어 있다', () => {
    for (const i of q.filter(i => i.options)) {
      expect(i.options!.length).toBe(4);
      expect(i.options!.filter(o => o.id === i.word.id).length).toBe(1);
      expect(new Set(i.options!.map(o => o.id)).size).toBe(4);
    }
  });
  it('문장 타일은 원래 문장과 같은 단어로 이루어지고 순서는 섞여 있다', () => {
    for (const i of q.filter(i => i.kind === 'arr')) {
      expect(i.tiles!.slice().sort()).toEqual(i.word.example.split(' ').sort());
      expect(i.tiles!.join(' ')).not.toBe(i.word.example);
    }
  });
  it('틀린 듣기 문제는 뜻 고르기로 다시 나온다', () => {
    const r = retryOf({ kind: 'listen', word: news[0] }, plan.pool);
    expect(r.kind).toBe('mc');
    expect(r.retry).toBe(true);
  });
});
