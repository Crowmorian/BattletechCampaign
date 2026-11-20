-- Replace the three User UID placeholders with those from Authentication → Users.
-- Change the company names below if you want different names for the two rosters.
do $onboard$
declare
  gm_id uuid := 'GM_USER_UID';
  first_player_id uuid := 'FIRST_PLAYER_USER_UID';
  second_player_id uuid := 'SECOND_PLAYER_USER_UID';
  first_company text := 'Rook Company';
  second_company text := 'Kestrel Lance';
begin
  if gm_id in (first_player_id, second_player_id) or first_player_id = second_player_id then
    raise exception 'Use three different Supabase Auth user IDs.';
  end if;

  if (
    select count(*) from auth.users where id in (gm_id, first_player_id, second_player_id)
  ) <> 3 then
    raise exception 'Create all three accounts in Supabase Auth before assigning campaign access.';
  end if;

  if exists (
    select 1 from public.campaign_members
    where (user_id = gm_id and role <> 'gm')
      or (user_id in (first_player_id, second_player_id) and role <> 'player')
  ) then
    raise exception 'An account already has a different campaign role. Check the IDs before continuing.';
  end if;

  insert into public.campaign_members (user_id, role)
  values (gm_id, 'gm'), (first_player_id, 'player'), (second_player_id, 'player')
  on conflict (user_id) do nothing;

  insert into public.rosters (owner_id, name)
  values (first_player_id, first_company), (second_player_id, second_company)
  on conflict (owner_id) do nothing;
end;
$onboard$;
