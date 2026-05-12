create extension if not exists "pgcrypto";

create type user_role as enum ('freelancer', 'client');
create type availability_status as enum ('available', 'busy', 'unavailable');
create type company_size as enum ('startup', 'small', 'medium', 'large');
create type project_budget_type as enum ('fixed', 'hourly');
create type project_experience_level as enum ('entry', 'intermediate', 'expert');
create type project_status as enum ('open', 'in_progress', 'completed');
create type proposal_status as enum ('submitted', 'shortlisted', 'accepted', 'rejected');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email_address text not null,
  display_name text not null,
  user_role user_role not null,
  profile_picture_url text,
  account_status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.freelancer_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  professional_title text,
  biography text,
  hourly_rate numeric(12,2),
  availability_status availability_status not null default 'available',
  location_country_city text,
  skills text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.client_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  company_name text,
  company_description text,
  company_industry text,
  company_size company_size,
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.users(id) on delete cascade,
  project_title text not null,
  project_description text not null,
  project_category_identifier text not null,
  project_budget_type project_budget_type not null,
  project_budget_minimum numeric(12,2) not null,
  project_budget_maximum numeric(12,2) not null,
  project_duration_estimate text,
  project_experience_level project_experience_level not null,
  project_skills_required text[] not null default '{}',
  project_status project_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  freelancer_id uuid not null references public.users(id) on delete cascade,
  proposed_budget_amount numeric(12,2) not null,
  proposed_duration_days integer not null,
  proposal_cover_letter text not null,
  proposal_status proposal_status not null default 'submitted',
  created_at timestamptz not null default now(),
  unique (project_id, freelancer_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  freelancer_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null references public.users(id) on delete cascade,
  last_message_date timestamptz not null default now(),
  unique (project_id, freelancer_id, client_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  message_text text not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email_address, display_name, user_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'user_role')::user_role, 'freelancer')
  );

  if coalesce(new.raw_user_meta_data->>'user_role', 'freelancer') = 'client' then
    insert into public.client_profiles (user_id) values (new.id);
  else
    insert into public.freelancer_profiles (user_id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.users enable row level security;
alter table public.freelancer_profiles enable row level security;
alter table public.client_profiles enable row level security;
alter table public.projects enable row level security;
alter table public.proposals enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Users can read active users" on public.users for select using (account_status = 'active');
create policy "Users can update own account" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Freelancer profiles are readable" on public.freelancer_profiles for select using (true);
create policy "Freelancers update own profile" on public.freelancer_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Client profiles are readable" on public.client_profiles for select using (true);
create policy "Clients update own profile" on public.client_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Open projects are public to authenticated users" on public.projects for select using (project_status = 'open' or auth.uid() = client_id);
create policy "Clients create own projects" on public.projects for insert with check (
  auth.uid() = client_id and exists (
    select 1 from public.users where users.id = auth.uid() and users.user_role = 'client'
  )
);
create policy "Clients update own projects" on public.projects for update using (auth.uid() = client_id) with check (auth.uid() = client_id);

create policy "Project participants read proposals" on public.proposals for select using (
  auth.uid() = freelancer_id or exists (
    select 1 from public.projects where projects.id = proposals.project_id and projects.client_id = auth.uid()
  )
);
create policy "Freelancers create own proposals" on public.proposals for insert with check (
  auth.uid() = freelancer_id and exists (
    select 1 from public.users where users.id = auth.uid() and users.user_role = 'freelancer'
  )
);
create policy "Project clients update proposals" on public.proposals for update using (
  exists (select 1 from public.projects where projects.id = proposals.project_id and projects.client_id = auth.uid())
) with check (
  exists (select 1 from public.projects where projects.id = proposals.project_id and projects.client_id = auth.uid())
);

create policy "Participants read conversations" on public.conversations for select using (auth.uid() in (freelancer_id, client_id));
create policy "Participants create conversations" on public.conversations for insert with check (auth.uid() in (freelancer_id, client_id));
create policy "Participants update conversations" on public.conversations for update using (auth.uid() in (freelancer_id, client_id));

create policy "Participants read messages" on public.messages for select using (
  exists (select 1 from public.conversations where conversations.id = messages.conversation_id and auth.uid() in (freelancer_id, client_id))
);
create policy "Participants send messages" on public.messages for insert with check (
  auth.uid() = sender_id and exists (
    select 1 from public.conversations where conversations.id = messages.conversation_id and auth.uid() in (freelancer_id, client_id)
  )
);
