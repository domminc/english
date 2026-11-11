export type Track = 'business' | 'general';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type User = { loginId: string; track: Track | null; level: Level | null; courseMin: 10 | 20 | 30 };
export type Word = { id: number; themeId: number; word: string; meaning: string; example: string; exampleKo: string };
export type PoolWord = { id: number; themeId: number; word: string; meaning: string };
export type Today = {
  today: string;
  streak: number;
  doneToday: boolean;
  week: { day: string; done: boolean }[];
  themeName: string;
  news: Word[];
  dueCount: number;
  learned: number;
  total: number;
  courseMin: 10 | 20 | 30;
};
export type SessionPlan = { id: string; free: boolean; themeName: string; news: Word[]; reviews: Word[]; pool: PoolWord[] };
export type Summary = { accuracy: number; newCount: number; reviewCount: number; minutes: number; streak: number };
export type VocabWord = Word & { box: number; dueOn: string | null };
export type Vocab = { today: string; themes: { id: number; name: string; words: VocabWord[] }[] };
export type Records = {
  today: string;
  month: string;
  days: string[];
  sessions: { day: string; themeName: string; newCount: number; reviewCount: number; accuracy: number }[];
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? '요청을 처리하지 못했습니다.', res.status);
  return data as T;
}

export const api = {
  me: () => call<{ user: User }>('GET', '/api/me'),
  signup: (loginId: string, password: string) => call<{ user: User }>('POST', '/api/auth/signup', { loginId, password }),
  login: (loginId: string, password: string) => call<{ user: User }>('POST', '/api/auth/login', { loginId, password }),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout', {}),
  updateMe: (patch: { track?: Track; level?: Level; courseMin?: number }) => call<{ user: User }>('PUT', '/api/me', patch),
  today: () => call<Today>('GET', '/api/today'),
  startSession: (courseMin: number) => call<SessionPlan>('POST', '/api/sessions', { courseMin }),
  answer: (id: string, body: { wordId: number; kind: string; answer?: unknown; retry?: boolean }) =>
    call<{ correct: boolean }>('POST', `/api/sessions/${id}/answers`, body),
  complete: (id: string) => call<Summary>('POST', `/api/sessions/${id}/complete`, {}),
  words: () => call<Vocab>('GET', '/api/words'),
  records: (month?: string) => call<Records>('GET', '/api/records' + (month ? `?month=${month}` : '')),
};

/* 발음: R2 의 음성을 먼저 쓰고, 없으면 브라우저 음성으로 읽는다. */
let current: HTMLAudioElement | null = null;
export function speak(wordId: number, part: 'word' | 'example', text: string) {
  try {
    current?.pause();
    window.speechSynthesis?.cancel();
    const audio = new Audio(`/media/audio/${wordId}/${part}`);
    current = audio;
    const fallback = () => {
      if (current !== audio || !('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    };
    audio.addEventListener('error', fallback, { once: true });
    audio.play().catch(fallback);
  } catch {
    /* 소리를 낼 수 없는 환경에서는 조용히 넘어간다 */
  }
}
