-- ═══════════════════════════════════════════════════════════════
-- Jobr.dk – Supabase Database Schema
-- Kør dette i Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════

-- ── Profiles (udvider auth.users) ────────────────────────────────
create table if not exists profiles (
  id              uuid references auth.users on delete cascade primary key,
  cv_filename     text,
  role_family     text,
  seniority       text,
  years_experience int,
  education       text,
  languages       text[],
  skills_json     text,      -- hele skills-array som JSON-streng
  keywords        text[],
  strengths       text[],
  ai_analyzed     boolean default false,
  ai_model        text,
  pref_work_mode       text,
  pref_industries      text[],
  pref_salary_min      int,
  pref_search_status   text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table profiles enable row level security;

create policy "Brugere kan se egen profil"
  on profiles for select using (auth.uid() = id);

create policy "Brugere kan oprette profil"
  on profiles for insert with check (auth.uid() = id);

create policy "Brugere kan opdatere profil"
  on profiles for update using (auth.uid() = id);

-- ── Jobs (cache fra Jobnet) ───────────────────────────────────────
create table if not exists jobs (
  id            text primary key,
  title         text,
  company       text,
  location      text,
  work_mode     text,
  salary        text,
  description   text,
  keywords      text[],
  posted_label  text,
  deadline      text,
  url           text,
  source        text,
  industry      text,
  fetched_at    timestamptz default now()
);

-- Jobs er offentlige (alle brugere kan læse)
alter table jobs enable row level security;
create policy "Jobs er offentlige" on jobs for select using (true);
create policy "Service kan skrive jobs" on jobs for all using (true);

-- ── Gemte jobs ────────────────────────────────────────────────────
create table if not exists saved_jobs (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade,
  job_id     text,
  saved_at   timestamptz default now(),
  unique(user_id, job_id)
);

alter table saved_jobs enable row level security;
create policy "Brugere styrer egne gemte jobs"
  on saved_jobs for all using (auth.uid() = user_id);

-- ── Ansøgte jobs ──────────────────────────────────────────────────
create table if not exists applied_jobs (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade,
  job_id     text,
  status     text default 'ansøgt',  -- ansøgt / samtale / tilbud / afvist
  applied_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, job_id)
);

alter table applied_jobs enable row level security;
create policy "Brugere styrer egne ansøgninger"
  on applied_jobs for all using (auth.uid() = user_id);

-- ── Auto-opdater updated_at ───────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger applied_jobs_updated_at
  before update on applied_jobs
  for each row execute function update_updated_at();

-- ── Opret profil automatisk ved ny bruger ─────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
