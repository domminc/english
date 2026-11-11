import type { ButtonHTMLAttributes, ReactNode } from 'react';

const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  chev: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  spk: 'M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4zM16 9a4.5 4.5 0 010 6M18.5 6.5a8 8 0 010 11',
  today: 'M7 3.5h7l4 4v13H7zM14 3.5v4h4M10 12.5h5M10 16h5',
  book: 'M4 5.5c3-1.2 5.5-1 8 .8 2.5-1.8 5-2 8-.8v13c-3-1.2-5.5-1-8 .8-2.5-1.8-5-2-8-.8zM12 6.3v13',
  chart: 'M5 19.5V11M12 19.5V5M19 19.5v-6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.8-3.8',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'plain' };
export function Button({ variant = 'primary', className = '', ...rest }: BtnProps) {
  return <button type="button" {...rest} className={`btn btn-${variant} ${className}`} />;
}

export function CircleButton({ icon, label, glass, size = 44, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; glass?: boolean; size?: number }) {
  return (
    <button type="button" {...rest} aria-label={label} className={`circle ${glass ? 'glass' : ''}`} style={{ width: size, height: size }}>
      <Icon name={icon} size={size >= 44 ? 22 : 18} stroke={2.2} />
    </button>
  );
}

/** 흰 바탕의 묶음 목록. 카드 대신 이것 하나만 쓴다. */
export function Group({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <section className="group-wrap">
      {caption && <h2 className="caption">{caption}</h2>}
      <div className="group">{children}</div>
    </section>
  );
}

type RowProps = { title: ReactNode; sub?: ReactNode; right?: ReactNode; strong?: boolean; muted?: boolean; danger?: boolean; onClick?: () => void; chevron?: boolean; selected?: boolean };
export function Row({ title, sub, right, strong, muted, danger, onClick, chevron, selected }: RowProps) {
  const body = (
    <>
      <span className="row-main">
        <span className={`row-title ${strong ? 'strong' : ''} ${muted ? 'muted' : ''} ${danger ? 'danger' : ''}`}>{title}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {right !== undefined && <span className="row-right">{right}</span>}
      {selected && (
        <span className="row-check">
          <Icon name="check" size={22} stroke={2.4} />
        </span>
      )}
      {chevron && (
        <span className="row-chev">
          <Icon name="chev" size={18} stroke={2.2} />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className="row" onClick={onClick} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <div className="row">{body}</div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Level({ box }: { box: number }) {
  return (
    <span className="level" role="img" aria-label={box ? `기억 단계 ${box} / 6` : '아직 배우지 않음'}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <i key={i} className={i <= box ? 'on' : ''} />
      ))}
    </span>
  );
}

/** 예문에서 학습 단어만 강조한다. */
export function Example({ text, word }: { text: string; word: string }) {
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <em className="hit">{text.slice(i, i + word.length)}</em>
      {text.slice(i + word.length)}
    </>
  );
}

export function Sheet({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label: string }) {
  return (
    <div className="sheet-layer">
      <div className="scrim" onClick={onClose} />
      <div className="sheet glass" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export const TABS = [
  { id: 'today', label: '오늘', icon: 'today' },
  { id: 'vocab', label: '단어장', icon: 'book' },
  { id: 'records', label: '기록', icon: 'chart' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

export function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabbar glass" aria-label="주요 화면">
      {TABS.map(t => (
        <button key={t.id} type="button" aria-current={t.id === active ? 'page' : undefined} onClick={() => onChange(t.id)}>
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="notice" role="alert">
      {children}
    </p>
  );
}

export function formatDay(day: string) {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일`;
}
