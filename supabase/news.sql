-- Auge! live news. Run after schema.sql.
-- articles: raw headlines pulled from RSS feeds (private).
-- stories:  clustered "auges" the app reads (public, read-only).

create table if not exists public.articles (
  url text primary key,
  source text not null,
  title text not null,
  summary text not null default '',
  lang text not null default 'es',
  published_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index if not exists articles_published_idx on public.articles (published_at desc);

create table if not exists public.stories (
  id text primary key,
  tag text not null,
  region text not null default 'Global',
  category text not null default 'sociedad',
  heat int not null default 0 check (heat between 0 and 100),
  brief text not null,
  facts jsonb not null default '[]',
  sources jsonb not null default '[]',
  topics text[] not null default '{}',
  timeline jsonb not null default '[]',
  media jsonb not null default '[]',
  claims jsonb not null default '[]',
  posts jsonb not null default '[]',
  pulse jsonb,
  clustered int not null default 0,
  -- Article URLs in this cluster; used to keep the same story id between runs.
  article_urls text[] not null default '{}',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists stories_active_heat_idx on public.stories (active, heat desc);

alter table public.articles enable row level security;
alter table public.stories enable row level security;
drop policy if exists "stories are public" on public.stories;
create policy "stories are public" on public.stories for select using (true);
-- No policies on articles: only the service role (the edge function) touches it.

-- Photos: the outlet's image per article, and the story's cover (first of stories.media).
alter table public.articles add column if not exists image text;
alter table public.stories add column if not exists image text;

-- Ingest every 15 minutes. The function checks the x-cron-secret header.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Editions: each story belongs to one language edition (es, en, de, fr, pt, it).
alter table public.stories add column if not exists lang text not null default 'es';
create index if not exists stories_lang_active_heat_idx on public.stories (lang, active, heat desc);
-- One cron job per edition, staggered by 2 minutes (see README for the command each job runs).

-- Countries: the outlet's country per article; per story its own country (ISO) and the countries covering it.
alter table public.articles add column if not exists country text;
alter table public.stories add column if not exists country text;
alter table public.stories add column if not exists countries text[] not null default '{}';
