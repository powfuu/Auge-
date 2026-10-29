-- Auge! — Supabase schema. Run in the Supabase SQL editor.
-- Auth (Google, Apple, phone OTP) is handled by Supabase Auth; these tables hang off auth.users.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Visible name and unique @handle (lowercase, 3–20 chars). Profile picture only, no banner.
  full_name text not null default '' check (char_length(full_name) <= 50),
  username text unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  -- Id from the in-app avatar collection (src/app/core/avatars.ts)
  avatar_id text not null default 'fox',
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.user_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  categories text[] not null default '{}',
  notify_followed boolean not null default true,
  notify_breaking boolean not null default true,
  notify_digest boolean not null default false,
  quiet_hours boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

alter table public.profiles enable row level security;
alter table public.user_prefs enable row level security;
alter table public.follows enable row level security;

-- Profiles are public (name, @username, avatar); only the owner can edit.
create policy "public profiles" on public.profiles for select using (true);
create policy "own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
-- Prefs and follows are private.
create policy "own prefs" on public.user_prefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own follows" on public.follows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create profile + prefs rows on sign-up, taking the name from Google or Apple when present.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''));
  insert into public.user_prefs (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
