import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, speak, type SessionPlan, type Summary, type Word } from './api';
import { KIND_LABEL, buildQueue, isCorrect, retryOf, type Item } from './queue';
import { Button, CircleButton, Example, Group, Icon, Row, Sheet } from './ui';

type Feedback = { correct: boolean; picked?: number };

export function Study({ plan, onExit, onDone }: { plan: SessionPlan; onExit: () => void; onDone: (s: Summary, missed: Word[]) => void }) {
  const [queue, setQueue] = useState<Item[]>(() => buildQueue(plan));
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');
  const missed = useRef(new Map<number, Word>());
  const item = queue[index];

  // 카드와 듣기 문제는 화면에 뜰 때 한 번 읽어 준다.
  useEffect(() => {
    if (item && (item.kind === 'learn' || item.kind === 'listen')) speak(item.word.id, 'word', item.word.word);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(async () => {
    setFinishing(true);
    setError('');
    try {
      onDone(await api.complete(plan.id), [...missed.current.values()]);
    } catch (e) {
      setError((e as Error).message);
      setFinishing(false);
    }
  }, [plan.id, onDone]);

  const submit = useCallback(
    (answer: number | string) => {
      if (!item || feedback) return;
      const correct = isCorrect(item, answer);
      setFeedback({ correct, picked: typeof answer === 'number' ? answer : undefined });
      if (!correct) {
        missed.current.set(item.word.id, item.word);
        setQueue(q => [...q, retryOf(item, plan.pool)]);
      }
      // 기록은 뒤에서 보낸다. 실패해도 학습은 이어 간다.
      api.answer(plan.id, { wordId: item.word.id, kind: item.kind, answer, retry: item.retry }).catch(() => {});
    },
    [item, feedback, plan],
  );

  const next = useCallback(() => {
    if (!item || finishing) return;
    if (item.kind === 'learn') api.answer(plan.id, { wordId: item.word.id, kind: 'learn' }).catch(() => {});
    setFeedback(null);
    setPicked([]);
    setTyped('');
    if (index + 1 >= queue.length) void finish();
    else setIndex(index + 1);
  }, [item, index, queue.length, finishing, finish, plan.id]);

  const arranged = useMemo(() => (item?.tiles ? picked.map(i => item.tiles![i]).join(' ') : ''), [item, picked]);
  const canCheck = item?.kind === 'arr' ? picked.length === item.tiles!.length : item?.kind === 'type' ? typed.trim().length > 0 : false;
  const check = useCallback(() => {
    if (!item || !canCheck) return;
    submit(item.kind === 'arr' ? arranged : typed);
  }, [item, canCheck, arranged, typed, submit]);

  // 데스크톱: Enter 로 넘기고, 1~4 로 보기를 고른다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!item) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (feedback || item.kind === 'learn') next();
        else check();
      } else if (!feedback && item.options && /^[1-4]$/.test(e.key) && (e.target as HTMLElement).tagName !== 'INPUT') {
        const o = item.options[Number(e.key) - 1];
        if (o) submit(o.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, feedback, next, check, submit]);

  if (!item) return null;
  const w = item.word;
  const pct = Math.round((index / queue.length) * 100);
  const blankAt = w.example.toLowerCase().indexOf(w.word.toLowerCase());

  const optionList = item.options && (
    <div className="group options">
      {item.options.map(o => {
        const state = feedback ? (o.id === w.id ? 'right' : o.id === feedback.picked ? 'wrong' : '') : '';
        return (
          <button key={o.id} type="button" className={`row option ${state}`} disabled={!!feedback} onClick={() => submit(o.id)}>
            <span className="row-main">
              <span className="row-title">{o.label}</span>
            </span>
            {state === 'right' && <Icon name="check" size={22} stroke={2.4} />}
            {state === 'wrong' && <Icon name="close" size={20} stroke={2.4} />}
          </button>
        );
      })}
    </div>
  );

  return (
    <main className="screen study">
      <header className="study-bar">
        <CircleButton icon="close" label="학습 그만하기" glass size={40} onClick={onExit} />
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
        <span className="count">
          {index + 1} / {queue.length}
        </span>
      </header>

      <p className="kind">
        {KIND_LABEL[item.kind]}
        {item.retry ? ' · 다시 풀기' : item.review ? ' · 복습' : ''}
      </p>

      {item.kind === 'learn' && (
        <>
          <WordImage id={w.id} />
          <div className="word-row">
            <h1 className="word">{w.word}</h1>
            <CircleButton icon="spk" label="발음 듣기" size={48} onClick={() => speak(w.id, 'word', w.word)} />
          </div>
          <p className="meaning">{w.meaning}</p>
          <hr />
          <div className="word-row">
            <div className="grow">
              <p className="example">
                <Example text={w.example} word={w.word} />
              </p>
              <p className="sub">{w.exampleKo}</p>
            </div>
            <CircleButton icon="spk" label="예문 듣기" size={40} onClick={() => speak(w.id, 'example', w.example)} />
          </div>
        </>
      )}

      {item.kind === 'mc' && (
        <>
          <div className="word-row">
            <h1 className="word">{w.word}</h1>
            <CircleButton icon="spk" label="발음 듣기" size={48} onClick={() => speak(w.id, 'word', w.word)} />
          </div>
          <p className="lead">알맞은 뜻을 고르세요.</p>
          {optionList}
        </>
      )}

      {item.kind === 'listen' && (
        <>
          <div className="word-row">
            <CircleButton icon="spk" label="다시 듣기" size={56} onClick={() => speak(w.id, 'word', w.word)} />
            <h1 className="prompt grow">{feedback ? w.word : '들리는 단어의 뜻을 고르세요.'}</h1>
          </div>
          {optionList}
        </>
      )}

      {item.kind === 'cm' && (
        <>
          <h1 className="prompt">{w.meaning}</h1>
          <p className="lead">알맞은 영어 단어를 고르세요.</p>
          {optionList}
        </>
      )}

      {item.kind === 'blank' && (
        <>
          <h1 className="prompt">
            {w.example.slice(0, blankAt)}
            <span className="blank" aria-label="빈칸" />
            {w.example.slice(blankAt + w.word.length)}
          </h1>
          <p className="lead">{w.exampleKo}</p>
          {optionList}
        </>
      )}

      {item.kind === 'arr' && (
        <>
          <h1 className="prompt">{w.exampleKo}</h1>
          <p className="lead">단어를 눌러 영어 문장을 만드세요.</p>
          <div className="slot" aria-label="내가 만든 문장">
            {picked.map((ti, i) => (
              <button key={ti} type="button" className="tile" disabled={!!feedback} onClick={() => setPicked(p => p.filter((_, j) => j !== i))}>
                {item.tiles![ti]}
              </button>
            ))}
          </div>
          <div className="bank">
            {item.tiles!.map((t, i) => (
              <button key={i} type="button" className={`tile ${picked.includes(i) ? 'used' : ''}`} disabled={!!feedback || picked.includes(i)} onClick={() => setPicked(p => [...p, i])}>
                {t}
              </button>
            ))}
          </div>
        </>
      )}

      {item.kind === 'type' && (
        <>
          <h1 className="prompt">{w.meaning}</h1>
          <p className="lead">
            영어로 써 보세요. {w.word.length}글자이고 <b>{w.word[0]}</b>(으)로 시작해요.
          </p>
          <input
            id="type-answer"
            className="field"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            disabled={!!feedback}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="영어 단어 입력"
          />
        </>
      )}

      <div className="grow" />
      {error && <p className="notice">{error}</p>}
      {item.kind === 'learn' && <Button onClick={next}>다음</Button>}
      {(item.kind === 'arr' || item.kind === 'type') && !feedback && (
        <Button onClick={check} disabled={!canCheck}>
          확인
        </Button>
      )}

      {feedback && (
        <Sheet label={feedback.correct ? '정답' : '오답'}>
          <div className="verdict">
            <span className={`badge ${feedback.correct ? 'good' : 'bad'}`}>
              <Icon name={feedback.correct ? 'check' : 'close'} size={16} stroke={2.8} />
            </span>
            <strong>{feedback.correct ? '정답이에요' : '다시 한번 볼게요'}</strong>
          </div>
          <div className="sheet-body">
            <p className="answer">
              {w.word} · {w.meaning}
            </p>
            <p className="sub">
              <Example text={w.example} word={w.word} />
            </p>
          </div>
          <Button onClick={next} disabled={finishing}>
            {finishing ? '정리하는 중' : '계속'}
          </Button>
        </Sheet>
      )}
    </main>
  );
}

/** R2 의 단어 이미지. 없거나 아직 만들지 못했으면 자리를 차지하지 않는다. */
export function WordImage({ id, small }: { id: number; small?: boolean }) {
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading');
  useEffect(() => setState('loading'), [id]);
  if (state === 'none') return null;
  return (
    <div className={`word-image ${small ? 'small' : ''} ${state}`}>
      <img src={`/media/image/${id}`} alt="" onLoad={() => setState('ok')} onError={() => setState('none')} />
    </div>
  );
}

export function Done({ summary, missed, onHome, onAgain }: { summary: Summary; missed: Word[]; onHome: () => void; onAgain: () => void }) {
  return (
    <main className="screen done">
      <h1 className="title-lg">오늘의 한 장 완료</h1>
      <div>
        <p className="big-number">
          {summary.accuracy}
          <small>%</small>
        </p>
        <p className="sub">처음 푼 문제 기준 정답률</p>
      </div>
      <Group>
        <Row title="새 단어" right={`${summary.newCount}개`} />
        <Row title="복습한 단어" right={`${summary.reviewCount}개`} />
        <Row title="걸린 시간" right={`${summary.minutes}분`} />
        <Row title="연속 학습" right={`${summary.streak}일`} />
      </Group>
      {missed.length > 0 && (
        <Group caption="틀린 단어 · 내일 다시 나와요">
          {missed.map(w => (
            <Row key={w.id} title={w.word} strong right={w.meaning} />
          ))}
        </Group>
      )}
      <div className="grow" />
      <div className="stack-sm">
        <Button onClick={onHome}>오늘 화면으로</Button>
        <Button variant="plain" onClick={onAgain}>
          한 세트 더 하기
        </Button>
      </div>
    </main>
  );
}
