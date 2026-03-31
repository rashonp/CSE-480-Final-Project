create extension if not exists pgcrypto;

create table if not exists public.installations (
  id uuid primary key default gen_random_uuid(),
  install_token_hash text not null unique,
  trigger_topics text not null default '',
  popup_threshold double precision not null default 0.1,
  created_at timestamptz not null default now()
);

create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete cascade,
  post_id text not null,
  selected_emotion text not null,
  trigger_intensity integer,
  summary text not null,
  final_score double precision,
  generic_score double precision,
  personalized_score double precision,
  created_at timestamptz not null default now()
);

create index if not exists reflections_installation_created_at_idx
  on public.reflections (installation_id, created_at desc);

create table if not exists public.comment_activity (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete cascade,
  post_id text not null,
  post_text text,
  comment_text text not null,
  comment_kind text not null check (comment_kind in ('comment', 'reply')),
  parent_comment_id text,
  parent_comment_text text,
  final_score double precision,
  heuristic_score double precision,
  llm_score double precision,
  created_at timestamptz not null default now()
);

alter table public.comment_activity
  add column if not exists final_score double precision;

alter table public.comment_activity
  add column if not exists heuristic_score double precision;

alter table public.comment_activity
  add column if not exists llm_score double precision;

create index if not exists comment_activity_installation_created_at_idx
  on public.comment_activity (installation_id, created_at desc);
