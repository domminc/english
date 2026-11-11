-- 하루 한 장 영어: 스키마. 여러 번 실행해도 안전하다.
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  login_id text not null unique check (login_id ~ '^[a-z0-9_]{4,20}$'),
  password_hash text not null,
  track text check (track in ('business', 'general')),
  level text check (level in ('beginner', 'intermediate', 'advanced')),
  course_min smallint not null default 10 check (course_min in (10, 20, 30)),
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now()
);

create table if not exists auth_sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists auth_sessions_user on auth_sessions(user_id);

create table if not exists themes (
  id serial primary key,
  track text not null check (track in ('business', 'general')),
  level text check (level in ('beginner', 'intermediate', 'advanced')),
  name text not null,
  sort_order int not null,
  unique (track, name)
);

create table if not exists words (
  id serial primary key,
  theme_id int not null references themes(id) on delete cascade,
  word text not null,
  meaning text not null,
  example text not null,
  example_ko text not null,
  sort_order int not null,
  unique (theme_id, word)
);

create table if not exists user_words (
  user_id uuid not null references users(id) on delete cascade,
  word_id int not null references words(id) on delete cascade,
  box smallint not null default 1 check (box between 1 and 6),
  due_on date not null,
  learned_on date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);
create index if not exists user_words_due on user_words(user_id, due_on);

create table if not exists study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  course_min smallint not null,
  theme_name text not null,
  new_count smallint not null default 0,
  review_count smallint not null default 0,
  first_total smallint not null default 0,
  first_correct smallint not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists study_sessions_user on study_sessions(user_id, completed_at desc);

create table if not exists study_days (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
