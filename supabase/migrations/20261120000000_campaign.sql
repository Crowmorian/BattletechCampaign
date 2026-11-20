begin;

create schema campaign_private;
revoke all on schema campaign_private from public, anon, authenticated;
grant usage on schema campaign_private to authenticated;

create table public.campaign_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('player', 'gm'))
);

create table public.rosters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.campaign_members (user_id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  supply bigint not null default 12 check (supply between -9007199254740991 and 9007199254740991)
);

create table public.roster_units (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references public.rosters (id) on delete cascade,
  chassis text not null check (char_length(btrim(chassis)) between 1 and 48),
  variant text not null check (char_length(btrim(variant)) between 1 and 32),
  unit_type text not null check (unit_type in ('mech', 'vehicle', 'air')),
  armor_total smallint not null check (armor_total between 0 and 300),
  armor_remaining smallint not null check (armor_remaining between 0 and armor_total),
  structure_total smallint not null check (structure_total between 0 and 300),
  structure_remaining smallint not null check (structure_remaining between 0 and structure_total),
  engine_hits smallint not null default 0 check (engine_hits between 0 and 1),
  fire_control_hits smallint not null default 0 check (fire_control_hits between 0 and 4),
  movement_hits smallint not null default 0 check (movement_hits between 0 and 4),
  weapon_hits smallint not null default 0 check (weapon_hits between 0 and 4),
  legacy_critical_hits text[] not null default '{}',
  inoperable boolean not null default false,
  created_at timestamptz not null default now()
);
create index roster_units_roster_id_idx on public.roster_units (roster_id);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  briefing text not null check (btrim(briefing) <> ''),
  reward bigint not null default 0 check (reward between 0 and 9007199254740991),
  visible boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, visible)
);

-- The single row selects either no contract or a published contract.
create table public.campaign_state (
  singleton boolean primary key default true check (singleton),
  current_contract_id uuid,
  required_visibility boolean not null default true check (required_visibility),
  foreign key (current_contract_id, required_visibility) references public.contracts (id, visible)
);
insert into public.campaign_state default values;

create table public.contract_objectives (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  status text not null default 'active' check (status in ('active', 'completed', 'lost')),
  created_at timestamptz not null default now()
);
create index contract_objectives_contract_id_idx on public.contract_objectives (contract_id);

create table public.handout_games (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100)
);
create unique index handout_games_normalized_name_idx on public.handout_games (lower(btrim(name)));

create table public.handouts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.handout_games (id),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null default '',
  visible boolean not null default false,
  created_at timestamptz not null default now()
);
create index handouts_game_id_idx on public.handouts (game_id);

create table public.handout_images (
  id uuid primary key default gen_random_uuid(),
  handout_id uuid not null references public.handouts (id) on delete cascade,
  filename text not null check (btrim(filename) <> ''),
  object_path text generated always as (handout_id::text || '/' || id::text) stored unique,
  created_at timestamptz not null default now()
);
create index handout_images_handout_id_idx on public.handout_images (handout_id);

create table public.faction_influence (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  score smallint not null default 0 check (score between -5 and 5),
  created_at timestamptz not null default now()
);
create unique index faction_influence_normalized_name_idx on public.faction_influence (lower(btrim(name)));

alter table public.campaign_members enable row level security;
alter table public.rosters enable row level security;
alter table public.roster_units enable row level security;
alter table public.contracts enable row level security;
alter table public.campaign_state enable row level security;
alter table public.contract_objectives enable row level security;
alter table public.handout_games enable row level security;
alter table public.handouts enable row level security;
alter table public.handout_images enable row level security;
alter table public.faction_influence enable row level security;

revoke all on table
  public.campaign_members, public.rosters, public.roster_units, public.contracts,
  public.campaign_state, public.contract_objectives, public.handout_games,
  public.handouts, public.handout_images, public.faction_influence
  from public, anon, authenticated;

grant select on table
  public.campaign_members, public.rosters, public.roster_units, public.contracts,
  public.campaign_state, public.contract_objectives, public.handout_games,
  public.handouts, public.handout_images, public.faction_influence
  to authenticated;

grant update (supply) on public.rosters to authenticated;
grant insert (
  roster_id, chassis, variant, unit_type, armor_total, armor_remaining, structure_total,
  structure_remaining, engine_hits, fire_control_hits, movement_hits, weapon_hits,
  legacy_critical_hits, inoperable
) on public.roster_units to authenticated;
grant update (
  chassis, variant, unit_type, armor_total, armor_remaining, structure_total,
  structure_remaining, engine_hits, fire_control_hits, movement_hits, weapon_hits,
  legacy_critical_hits, inoperable
) on public.roster_units to authenticated;
grant delete on public.roster_units to authenticated;
grant insert (title, briefing, reward, visible), update (title, briefing, reward, visible)
  on public.contracts to authenticated;
grant update (current_contract_id) on public.campaign_state to authenticated;
grant insert (contract_id, name), update (status) on public.contract_objectives to authenticated;
grant insert (name) on public.handout_games to authenticated;
grant insert (title, body, visible, game_id), update (title, body, visible, game_id), delete
  on public.handouts to authenticated;
grant insert (handout_id, filename), delete on public.handout_images to authenticated;
grant insert (name), update (score), delete on public.faction_influence to authenticated;

create policy campaign_members_read_own on public.campaign_members
  for select to authenticated using (user_id = (select auth.uid()));

-- These functions run with the caller's rights. The member policy exposes only the caller's row.
create function campaign_private.is_member() returns boolean
  language sql stable set search_path = ''
  as $$ select exists (select 1 from public.campaign_members where user_id = (select auth.uid())); $$;

create function campaign_private.is_gm() returns boolean
  language sql stable set search_path = ''
  as $$ select exists (select 1 from public.campaign_members where user_id = (select auth.uid()) and role = 'gm'); $$;

revoke all on function campaign_private.is_member(), campaign_private.is_gm() from public, anon, authenticated;
grant execute on function campaign_private.is_member(), campaign_private.is_gm() to authenticated;

create policy rosters_read_owner_or_gm on public.rosters
  for select to authenticated using (owner_id = (select auth.uid()) or (select campaign_private.is_gm()));
create policy rosters_update_owner on public.rosters
  for update to authenticated
  using (owner_id = (select auth.uid()) and not (select campaign_private.is_gm()))
  with check (owner_id = (select auth.uid()) and not (select campaign_private.is_gm()));

create function campaign_private.owns_roster(target_roster uuid) returns boolean
  language sql stable set search_path = ''
  as $$
    select not (select campaign_private.is_gm()) and exists (
      select 1 from public.rosters where id = target_roster and owner_id = (select auth.uid())
    );
  $$;
revoke all on function campaign_private.owns_roster(uuid) from public, anon, authenticated;
grant execute on function campaign_private.owns_roster(uuid) to authenticated;

create policy roster_units_read_owner_or_gm on public.roster_units
  for select to authenticated using (exists (select 1 from public.rosters where rosters.id = roster_units.roster_id));
create policy roster_units_write_owner on public.roster_units
  for all to authenticated
  using (campaign_private.owns_roster(roster_id))
  with check (campaign_private.owns_roster(roster_id));

create policy contracts_read_published on public.contracts
  for select to authenticated using (visible and (select campaign_private.is_member()));
create policy contracts_manage_gm on public.contracts
  for all to authenticated using ((select campaign_private.is_gm())) with check ((select campaign_private.is_gm()));

create policy campaign_state_read_members on public.campaign_state
  for select to authenticated using ((select campaign_private.is_member()));
create policy campaign_state_update_gm on public.campaign_state
  for update to authenticated using ((select campaign_private.is_gm())) with check ((select campaign_private.is_gm()));

create policy contract_objectives_read_current on public.contract_objectives
  for select to authenticated using (exists (
    select 1 from public.campaign_state where campaign_state.current_contract_id = contract_objectives.contract_id
  ));
create policy contract_objectives_manage_gm on public.contract_objectives
  for all to authenticated using ((select campaign_private.is_gm())) with check ((select campaign_private.is_gm()));

create policy handouts_read_published on public.handouts
  for select to authenticated using (visible and (select campaign_private.is_member()));
create policy handouts_manage_gm on public.handouts
  for all to authenticated using ((select campaign_private.is_gm())) with check ((select campaign_private.is_gm()));

create policy handout_games_read_visible on public.handout_games
  for select to authenticated using (exists (
    select 1 from public.handouts where handouts.game_id = handout_games.id
  ));
create policy handout_games_manage_gm on public.handout_games
  for all to authenticated using ((select campaign_private.is_gm())) with check ((select campaign_private.is_gm()));

create policy handout_images_read_visible on public.handout_images
  for select to authenticated using (exists (
    select 1 from public.handouts where handouts.id = handout_images.handout_id
  ));
create policy handout_images_manage_gm on public.handout_images
  for all to authenticated using ((select campaign_private.is_gm())) with check ((select campaign_private.is_gm()));

create policy influence_read_members on public.faction_influence
  for select to authenticated using ((select campaign_private.is_member()));
create policy influence_manage_gm on public.faction_influence
  for all to authenticated using ((select campaign_private.is_gm())) with check ((select campaign_private.is_gm()));

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('campaign-handouts', 'campaign-handouts', false, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

-- The Storage API handles the files. These policies link its access to the handout records.
create policy campaign_handout_files_read on storage.objects
  for select to authenticated using (
    bucket_id = 'campaign-handouts' and (
      (select campaign_private.is_gm()) or exists (
        select 1 from public.handout_images where object_path = objects.name
      )
    )
  );
create policy campaign_handout_files_upload_gm on storage.objects
  for insert to authenticated with check (
    bucket_id = 'campaign-handouts' and (select campaign_private.is_gm()) and exists (
      select 1 from public.handout_images where object_path = objects.name
    )
  );
create policy campaign_handout_files_delete_gm on storage.objects
  for delete to authenticated using (bucket_id = 'campaign-handouts' and (select campaign_private.is_gm()));

commit;
