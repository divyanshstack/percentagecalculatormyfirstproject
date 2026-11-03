-- Supabase Auth owns credentials; this profile table only stores display names.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jee_user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.jee_user_data enable row level security;

drop policy if exists "Students read their own profile" on public.profiles;
create policy "Students read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Students create their own profile" on public.profiles;
create policy "Students create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Students update their own profile" on public.profiles;
create policy "Students update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Students read their own study data" on public.jee_user_data;
create policy "Students read their own study data"
  on public.jee_user_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Students create their own study data" on public.jee_user_data;
create policy "Students create their own study data"
  on public.jee_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students update their own study data" on public.jee_user_data;
create policy "Students update their own study data"
  on public.jee_user_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.create_student_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_student_profile();

revoke all on table public.profiles from anon;
revoke all on table public.jee_user_data from anon;
revoke all on table public.profiles from public;
revoke all on table public.jee_user_data from public;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.jee_user_data to authenticated;
revoke all on function public.create_student_profile() from public, anon, authenticated;
