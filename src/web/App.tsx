import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, api, speak, type Level as LevelId, type Records, type SessionPlan, type Summary, type Today, type Track, type User, type Vocab, type VocabWord, type Word } from './api';
import { Done, Study, WordImage } from './study';
import { Button, CircleButton, Example, Group, Icon, Level, Notice, Row, Segmented, Sheet, TabBar, formatDay, type TabId } from './ui';

const TRACK_LABEL: Record<string, string> = { business: '업무 영어', beginner: '일반 영어 초급', intermediate: '일반 영어 중급', advanced: '일반 영어 고급' };
const trackLabel = (u: User) => (u.track === 'business' ? TRACK_LABEL.business : u.level ? TRACK_LABEL[u.level] : '');
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

type View = { name: 'tabs' } | { name: 'track' } | { name: 'study'; plan: SessionPlan } | { name: 'done'; summary: Summary; missed: Word[] };

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [tab, setTab] = useState<TabId>('today');
  const [view, setView] = useState<View>({ name: 'tabs' });
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    api
      .me()
      .then(r => setUser(r.user))
      .catch((e: ApiError) => (e.status === 401 ? setUser(null) : setBootError(e.message)));
  }, []);

  const start = useCallback(async (courseMin: number) => setView({ name: 'study', plan: await api.startSession(courseMin) }), []);

  if (bootError)
    return (
      <main className="screen center">
        <Notice>{bootError}</Notice>
        <Button onClick={() => location.reload()}>다시 시도</Button>
      </main>
    );
  if (user === undefined) return <main className="screen center" aria-busy="true" />;
  if (user === null) return <Auth onDone={setUser} />;
  if (!user.track || view.name === 'track')
    return (
      <TrackPicker
        user={user}
        onDone={u => {
          setUser(u);
          setView({ name: 'tabs' });
        }}
        onCancel={user.track ? () => setView({ name: 'tabs' }) : undefined}
      />
    );
  if (view.name === 'study')
    return <Study plan={view.plan} onExit={() => setView({ name: 'tabs' })} onDone={(summary, missed) => setView({ name: 'done', summary, missed })} />;
  if (view.name === 'done')
    return (
      <Done
        summary={view.summary}
        missed={view.missed}
        onHome={() => {
          setTab('today');
          setView({ name: 'tabs' });
        }}
        onAgain={() => void start(user.courseMin)}
      />
    );

  return (
    <>
      {tab === 'today' && <TodayScreen user={user} onUser={setUser} onStart={start} />}
      {tab === 'vocab' && <VocabScreen />}
      {tab === 'records' && <RecordsScreen user={user} onUser={setUser} onTrack={() => setView({ name: 'track' })} onLogout={() => setUser(null)} />}
      <TabBar active={tab} onChange={setTab} />
    </>
  );
}

/* ---------- AU-01 로그인 · 가입 ---------- */

function Auth({ onDone }: { onDone: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = mode === 'login' ? await api.login(loginId, password) : await api.signup(loginId, password);
      onDone(r.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="screen auth">
      <header className="stack-sm">
        <h1 className="title-xl">하루 한 장 영어</h1>
        <p className="lead">하루 10분, 단어와 문장을 한 장씩.</p>
      </header>
      <form onSubmit={submit} className="stack">
        <div className="group">
          <label className="row input-row">
            <span className="sr-only">아이디</span>
            <input id="login-id" value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="아이디" autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} required />
          </label>
          <label className="row input-row">
            <span className="sr-only">비밀번호</span>
            <input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </label>
        </div>
        {mode === 'signup' && <p className="caption">아이디는 영문 소문자와 숫자 4~20자, 비밀번호는 8자 이상입니다. 비밀번호를 잊으면 되찾을 수 없으니 기억해 두세요.</p>}
        {error && <Notice>{error}</Notice>}
        <div className="grow" />
        <div className="stack-sm">
          <Button type="submit" disabled={busy}>
            {mode === 'login' ? '로그인' : '계정 만들기'}
          </Button>
          <Button
            variant="plain"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? '계정 만들기' : '이미 계정이 있어요'}
          </Button>
        </div>
      </form>
    </main>
  );
}

/* ---------- AU-02 과정 선택 ---------- */

function TrackPicker({ user, onDone, onCancel }: { user: User; onDone: (u: User) => void; onCancel?: () => void }) {
  const [choice, setChoice] = useState<string>(user.track === 'general' ? (user.level ?? 'business') : 'business');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const patch = choice === 'business' ? { track: 'business' as Track } : { track: 'general' as Track, level: choice as LevelId };
      onDone((await api.updateMe(patch)).user);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="screen track">
      {onCancel && <CircleButton icon="back" label="돌아가기" glass size={40} onClick={onCancel} />}
      <header className="stack-sm">
        <h1 className="title-lg">
          어떤 영어부터
          <br />
          시작할까요?
        </h1>
        <p className="lead">나중에 기록 탭에서 바꿀 수 있어요. 배운 단어의 복습은 계속 이어집니다.</p>
      </header>
      <Group caption="업무 영어">
        <Row title="직장인 업무 영어" sub="회의 · 이메일 · IT 기획 · 협상 · 300단어" strong={choice === 'business'} selected={choice === 'business'} onClick={() => setChoice('business')} />
      </Group>
      <Group caption="일반 영어">
        <Row title="초급" sub="자주 쓰는 기본 단어와 짧은 문장" strong={choice === 'beginner'} selected={choice === 'beginner'} onClick={() => setChoice('beginner')} />
        <Row title="중급" sub="일상 대화와 여행에서 쓰는 표현" strong={choice === 'intermediate'} selected={choice === 'intermediate'} onClick={() => setChoice('intermediate')} />
        <Row title="고급" sub="뉴스와 토론에 나오는 어휘" strong={choice === 'advanced'} selected={choice === 'advanced'} onClick={() => setChoice('advanced')} />
      </Group>
      {error && <Notice>{error}</Notice>}
      <div className="grow" />
      <Button onClick={save} disabled={busy}>
        {onCancel ? '이 과정으로 바꾸기' : '시작하기'}
      </Button>
    </main>
  );
}

/* ---------- HM-01 오늘 ---------- */

function TodayScreen({ user, onUser, onStart }: { user: User; onUser: (u: User) => void; onStart: (courseMin: number) => Promise<void> }) {
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const load = useCallback(() => {
    api.today().then(setData, e => setError(e.message));
  }, []);
  useEffect(load, [load, user.courseMin, user.track, user.level]);

  const setCourse = async (m: 10 | 20 | 30) => {
    try {
      onUser((await api.updateMe({ courseMin: m })).user);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const start = async () => {
    setStarting(true);
    setError('');
    try {
      await onStart(user.courseMin);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  const d = data ? new Date(data.today + 'T00:00:00') : null;
  const hasWork = !!data && (data.news.length > 0 || data.dueCount > 0);
  const label = starting ? '준비하는 중' : !data ? '학습 시작' : !hasWork ? '자유 복습 하기' : data.doneToday ? '한 세트 더 하기' : '학습 시작';

  return (
    <main className="screen tabbed has-cta">
      <header>
        <p className="eyebrow">{d ? `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[(d.getDay() + 6) % 7]}요일` : ' '}</p>
        <h1 className="title-xl">오늘</h1>
      </header>

      <section className="stack-sm" aria-label="연속 학습">
        <p className="streak">
          <b>{data?.streak ?? 0}</b>
          <span>일 연속</span>
        </p>
        <ol className="week">
          {(data?.week ?? WEEKDAYS.map(() => ({ day: '', done: false }))).map((w, i) => (
            <li key={i} className={`${w.done ? 'done' : ''} ${data && w.day === data.today ? 'now' : ''}`}>
              <i />
              {WEEKDAYS[i]}
            </li>
          ))}
        </ol>
      </section>

      <section className="stack-sm">
        <div className="section-head">
          <h2>오늘의 한 장 · {data?.themeName ?? ''}</h2>
          <span>{data ? `새 단어 ${data.news.length} · 복습 ${data.dueCount}` : ''}</span>
        </div>
        <Segmented
          label="하루 학습 시간"
          value={user.courseMin}
          onChange={setCourse}
          options={[
            { value: 10, label: '10분' },
            { value: 20, label: '20분' },
            { value: 30, label: '30분' },
          ]}
        />
        {data && data.news.length > 0 && (
          <div className="group">
            {data.news.map(w => (
              <Row key={w.id} title={w.word} strong right={w.meaning} />
            ))}
          </div>
        )}
        {data && data.news.length === 0 && (
          <p className="caption">
            {data.dueCount > 0
              ? '이 과정의 새 단어를 모두 배웠어요. 오늘은 복습만 합니다.'
              : data.learned > 0
                ? '오늘 복습할 단어가 없어요. 배운 단어 중 10개를 가볍게 다시 볼 수 있습니다.'
                : '아직 준비된 단어가 없습니다.'}
          </p>
        )}
        {data && (
          <p className="caption">
            {trackLabel(user)} · 배운 단어 {data.learned} / {data.total}
          </p>
        )}
      </section>
      {error && <Notice>{error}</Notice>}

      <div className="cta">
        <Button onClick={start} disabled={starting || !data || (!hasWork && data.learned === 0)}>
          {label}
        </Button>
      </div>
    </main>
  );
}

/* ---------- VC-01 단어장, VC-02 단어 상세 ---------- */

function VocabScreen() {
  const [data, setData] = useState<Vocab | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'known'>('all');
  const [open, setOpen] = useState<VocabWord | null>(null);
  useEffect(() => {
    api.words().then(setData, e => setError(e.message));
  }, []);

  const themes = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.themes
      .map(t => ({
        ...t,
        learned: t.words.filter(w => w.box > 0).length,
        shown: t.words.filter(w => {
          if (q && !w.word.toLowerCase().includes(q) && !w.meaning.includes(q)) return false;
          if (filter === 'due') return w.box > 0 && !!w.dueOn && w.dueOn <= data.today;
          if (filter === 'known') return w.box >= 5;
          return true;
        }),
      }))
      .filter(t => t.shown.length > 0);
  }, [data, query, filter]);

  return (
    <main className="screen tabbed">
      <h1 className="title-xl">단어장</h1>
      <label className="search">
        <Icon name="search" size={18} stroke={2.2} />
        <span className="sr-only">단어 검색</span>
        <input id="vocab-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="단어 검색" autoCapitalize="off" autoCorrect="off" />
      </label>
      <Segmented
        label="단어 필터"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: '전체' },
          { value: 'due', label: '복습 예정' },
          { value: 'known', label: '외운 단어' },
        ]}
      />
      {error && <Notice>{error}</Notice>}
      {data && themes.length === 0 && <p className="caption">{filter === 'all' ? '찾는 단어가 없습니다.' : filter === 'due' ? '오늘 복습할 단어가 없습니다.' : '기억 단계 5 이상인 단어가 아직 없습니다.'}</p>}
      {themes.map(t => (
        <Group key={t.id} caption={`${t.name} · ${t.learned} / ${t.words.length}`}>
          {t.shown.map(w => (
            <Row key={w.id} title={w.word} sub={w.meaning} strong={w.box > 0} muted={w.box === 0} right={<Level box={w.box} />} onClick={() => setOpen(w)} />
          ))}
        </Group>
      ))}
      {open && (
        <Sheet label={`${open.word} 상세`} onClose={() => setOpen(null)}>
          <span className="grabber" />
          <WordImage id={open.id} small />
          <div className="sheet-body">
            <div className="word-row">
              <h2 className="word sm">{open.word}</h2>
              <CircleButton icon="spk" label="발음 듣기" onClick={() => speak(open.id, 'word', open.word)} />
            </div>
            <p className="meaning sm">{open.meaning}</p>
            <p className="example sm">
              <Example text={open.example} word={open.word} />
            </p>
            <p className="sub">{open.exampleKo}</p>
          </div>
          <div className="group">
            <Row title="기억 단계" right={<Level box={open.box} />} />
            <Row title="다음 복습" right={open.dueOn ? formatDay(open.dueOn) : '아직 배우지 않음'} />
          </div>
          <Button onClick={() => setOpen(null)}>닫기</Button>
        </Sheet>
      )}
    </main>
  );
}

/* ---------- RC-01 기록 · 설정 ---------- */

function RecordsScreen({ user, onUser, onTrack, onLogout }: { user: User; onUser: (u: User) => void; onTrack: () => void; onLogout: () => void }) {
  const [data, setData] = useState<Records | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.records().then(setData, e => setError(e.message));
  }, []);

  const cells = useMemo(() => {
    if (!data) return [];
    const [y, m] = data.month.split('-').map(Number);
    const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= count; d++) out.push(d);
    return out;
  }, [data]);
  const [y, m] = data ? data.month.split('-').map(Number) : [0, 0];
  const dayKey = (d: number) => `${data!.month}-${String(d).padStart(2, '0')}`;

  const logout = async () => {
    await api.logout().catch(() => {});
    onLogout();
  };
  const cycleCourse = async () => {
    const nextMin = ({ 10: 20, 20: 30, 30: 10 } as const)[user.courseMin];
    try {
      onUser((await api.updateMe({ courseMin: nextMin })).user);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="screen tabbed">
      <h1 className="title-xl">기록</h1>
      {error && <Notice>{error}</Notice>}
      {data && (
        <section className="stack-sm">
          <div className="section-head">
            <h2>
              {y}년 {m}월
            </h2>
            <span>이번 달 {data.days.length}일 학습</span>
          </div>
          <div className="calendar" role="img" aria-label={`${m}월 학습 달력, ${data.days.length}일 학습`}>
            {WEEKDAYS.map(w => (
              <span key={w} className="head">
                {w}
              </span>
            ))}
            {cells.map((d, i) => (
              <span key={i} className={d == null ? '' : `${data.days.includes(dayKey(d)) ? 'done' : ''} ${dayKey(d) === data.today ? 'now' : ''}`}>
                {d}
              </span>
            ))}
          </div>
        </section>
      )}
      {data && (
        <Group caption="최근 세트">
          {data.sessions.length === 0 && <Row title="아직 끝낸 세트가 없습니다." muted />}
          {data.sessions.map((s, i) => (
            <Row key={i} title={`${formatDay(s.day)} · ${s.themeName}`} sub={`새 단어 ${s.newCount} · 복습 ${s.reviewCount}`} right={`${s.accuracy}%`} />
          ))}
        </Group>
      )}
      <Group caption="설정">
        <Row title="기본 코스" right={`${user.courseMin}분`} chevron onClick={cycleCourse} />
        <Row title="학습 과정" right={trackLabel(user)} chevron onClick={onTrack} />
        <Row title="아이디" right={user.loginId} />
        <Row title="로그아웃" danger onClick={logout} />
      </Group>
    </main>
  );
}
