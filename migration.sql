-- ThermoPrep v2 schema.
-- Run once in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS everywhere).
--
-- Compared with v1 this drops Google Drive entirely (PDFs are extracted client-side
-- and never stored server-side) and adds: document_pages (raw per-page text + scan
-- flag), topics (auto-detected from headings), figures (real extracted images, not
-- just captions), a persistent question bank, and per-question SRS review state.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists users_app (
  email text primary key,
  name text,
  image text,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_email text not null references users_app(email) on delete cascade,
  title text not null,
  status text not null default 'extracting', -- extracting | chunking | embedding | processed | failed
  page_count integer,
  scanned_page_count integer not null default 0,
  chunk_count integer,
  figure_count integer not null default 0,
  topic_count integer not null default 0,
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_email_idx on documents(user_email, created_at desc);

-- Raw per-page text, kept so the document can be re-chunked without re-uploading it.
create table if not exists document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_email text not null references users_app(email) on delete cascade,
  page_number integer not null,
  text text not null default '',
  -- [{"text": "...", "size": 11.5}, ...] from pdf.js's text content, per line. Only
  -- needed transiently by /finalize (heading-size detection); cleared afterwards.
  lines jsonb not null default '[]'::jsonb,
  char_count integer not null default 0,
  is_scanned boolean not null default false,
  ocr_used boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists document_pages_doc_page_idx on document_pages(document_id, page_number);
create index if not exists document_pages_user_email_idx on document_pages(user_email);

-- Auto-detected sections/topics (from heading font sizes + numbering), one per
-- document. This is what the practice/mock UI lets a student pick, instead of a
-- free-text topic box.
create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_email text not null references users_app(email) on delete cascade,
  key text not null,
  label text not null,
  first_page integer,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists topics_doc_key_idx on topics(document_id, key);
create index if not exists topics_user_email_idx on topics(user_email);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_email text not null references users_app(email) on delete cascade,
  topic_id uuid references topics(id) on delete set null,
  chunk_index integer not null,
  content text not null,
  page_start integer,
  page_end integer,
  section_title text not null default '',
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists document_chunks_document_id_idx on document_chunks(document_id);
create index if not exists document_chunks_user_email_idx on document_chunks(user_email);
create index if not exists document_chunks_topic_idx on document_chunks(topic_id);
create index if not exists document_chunks_pending_idx on document_chunks(document_id) where embedding is null;
create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Real images captured from the textbook: either a cropped embedded raster image or a
-- rendered full page, keyed to the page it came from. image_data_url is a compressed
-- (resized, jpeg/webp) data URL — small enough to live in Postgres directly, capped
-- per document by MAX_FIGURES_PER_DOCUMENT so a 500-page book doesn't bloat the row set.
create table if not exists figures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_email text not null references users_app(email) on delete cascade,
  page integer not null,
  kind text not null default 'embedded', -- embedded | full-page
  caption text not null default '',
  -- Text OCR'd out of the image itself (axis labels on a diagram, or the page body
  -- text when the whole page was scanned and had no selectable text at all).
  ocr_text text,
  image_data_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists figures_document_id_idx on figures(document_id);
create index if not exists figures_user_email_idx on figures(user_email);
create index if not exists figures_page_idx on figures(document_id, page);

-- Question bank: generated once per topic/chunk and reused across sessions, so spaced
-- repetition has something stable to schedule instead of a fresh AI call every time.
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  user_email text not null references users_app(email) on delete cascade,
  topic_id uuid references topics(id) on delete set null,
  chunk_id uuid references document_chunks(id) on delete set null,
  type text not null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  answer text not null default '',
  unit text,
  tolerance_pct numeric,
  solution jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  trap text not null default '',
  source text not null default '',
  difficulty smallint not null default 3,
  page_start integer,
  page_end integer,
  figure_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists questions_user_email_idx on questions(user_email);
create index if not exists questions_topic_idx on questions(topic_id);
create index if not exists questions_document_idx on questions(document_id);

-- One SM-2 review record per (user, question). Never expires; drives "due today".
create table if not exists question_reviews (
  id uuid primary key default gen_random_uuid(),
  user_email text not null references users_app(email) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  ease numeric not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  due_at timestamptz not null default now(),
  last_quality smallint,
  updated_at timestamptz not null default now()
);

create unique index if not exists question_reviews_user_question_idx on question_reviews(user_email, question_id);
create index if not exists question_reviews_due_idx on question_reviews(user_email, due_at);

-- Rolling per-topic mastery (0..1 EMA of review quality) — powers the dashboard's
-- weak-topics list and the session builder's "prioritise weak topics" weighting.
create table if not exists topic_mastery (
  user_email text not null references users_app(email) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  mastery numeric not null default 0,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_email, topic_id)
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null references users_app(email) on delete cascade,
  mode text not null default 'adaptive', -- adaptive | topic | mock
  topic_label text not null default 'Mixed review',
  level text not null default 'GATE / ESE',
  time_limit_sec integer,
  question_ids jsonb not null default '[]'::jsonb,
  score integer,
  total integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists sessions_user_email_idx on sessions(user_email, created_at desc);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_email text not null references users_app(email) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  question_id uuid not null references questions(id) on delete cascade,
  user_answer text not null default '',
  correct boolean,
  quality smallint not null default 3,
  time_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists attempts_user_email_idx on attempts(user_email, created_at desc);
create index if not exists attempts_question_idx on attempts(question_id);

create table if not exists learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null references users_app(email) on delete cascade,
  topic text not null,
  level text,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists learning_sessions_user_email_idx on learning_sessions(user_email, created_at desc);

-- Generation-quota bookkeeping (replaces counting quizzes+learning_sessions in v1).
create table if not exists ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_email text not null references users_app(email) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_generations_user_email_idx on ai_generations(user_email, created_at desc);

-- Vector search, scoped to one user, optionally to a set of documents and/or one topic.
create or replace function match_document_chunks(
  query_embedding vector(768),
  match_count int,
  filter_user_email text,
  filter_document_ids uuid[],
  filter_topic_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  topic_id uuid,
  chunk_index int,
  content text,
  page_start int,
  page_end int,
  section_title text,
  similarity float
)
language sql stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.topic_id,
    document_chunks.chunk_index,
    document_chunks.content,
    document_chunks.page_start,
    document_chunks.page_end,
    document_chunks.section_title,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where document_chunks.user_email = filter_user_email
    and document_chunks.document_id = any(filter_document_ids)
    and (filter_topic_id is null or document_chunks.topic_id = filter_topic_id)
    and document_chunks.embedding is not null
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- Row Level Security: the app only ever talks to Supabase with the service-role key
-- (see lib/supabase.ts), which bypasses RLS by design. Enabling RLS with no policies
-- is defence-in-depth against an anon/public key ever being used against this schema.
alter table users_app enable row level security;
alter table documents enable row level security;
alter table document_pages enable row level security;
alter table topics enable row level security;
alter table document_chunks enable row level security;
alter table figures enable row level security;
alter table questions enable row level security;
alter table question_reviews enable row level security;
alter table topic_mastery enable row level security;
alter table sessions enable row level security;
alter table attempts enable row level security;
alter table learning_sessions enable row level security;
alter table ai_generations enable row level security;
