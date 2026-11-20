-- Run in the dashboard SQL Editor after onboarding. All test writes are rolled back.
begin;

do $verify$
declare
  gm_id uuid;
  player_ids uuid[];
  player_id uuid;
  roster_id uuid;
  visible_contract uuid;
  draft_contract uuid;
  visible_handout uuid;
  draft_handout uuid;
  visible_image uuid;
  draft_image uuid;
  affected integer;
begin
  if (select count(*) from public.campaign_members where role = 'gm') <> 1 then
    raise exception 'Expected exactly one GM account. Check the onboarding entries.';
  end if;
  select user_id into gm_id from public.campaign_members where role = 'gm';
  select array_agg(user_id) into player_ids from public.campaign_members where role = 'player';
  if cardinality(player_ids) is distinct from 2
    or (select count(*) from public.rosters where owner_id = any (player_ids)) <> 2
  then
    raise exception 'Expected two player accounts with one roster each.';
  end if;

  if not exists (
    select 1 from storage.buckets where id = 'campaign-handouts' and not public
  ) or not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass)
    or not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'campaign_handout_files_read'
    )
  then
    raise exception 'The private handout bucket or its read policy is missing.';
  end if;

  insert into public.contracts (title, briefing, visible) values ('Verification offer', 'SQL check', true)
  returning id into visible_contract;
  insert into public.contracts (title, briefing) values ('Verification draft', 'SQL check')
  returning id into draft_contract;
  insert into public.handouts (title, visible) values ('Verification handout', true)
  returning id into visible_handout;
  insert into public.handouts (title) values ('Verification private handout')
  returning id into draft_handout;
  insert into public.handout_images (handout_id, filename) values (visible_handout, 'verification.png')
  returning id into visible_image;
  insert into public.handout_images (handout_id, filename) values (draft_handout, 'verification.png')
  returning id into draft_image;

  perform set_config('role', 'authenticated', true);
  foreach player_id in array player_ids loop
    perform set_config('request.jwt.claim.sub', player_id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', player_id, 'role', 'authenticated')::text, true);

    select id into roster_id from public.rosters where owner_id = player_id;
    if roster_id is null or (select count(*) from public.rosters) <> 1 then
      raise exception 'A player could not read exactly their own roster.';
    end if;
    update public.rosters set supply = supply where id = roster_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'A player could not save supply points on their own roster.';
    end if;

    if (select count(*) from public.contracts where id in (visible_contract, draft_contract)) <> 1
      or not exists (select 1 from public.contracts where id = visible_contract)
      or (select count(*) from public.handouts where id in (visible_handout, draft_handout)) <> 1
      or not exists (select 1 from public.handouts where id = visible_handout)
      or (select count(*) from public.handout_images where id in (visible_image, draft_image)) <> 1
      or not exists (select 1 from public.handout_images where id = visible_image)
    then
      raise exception 'A player did not see only the published contract, handout, and image record.';
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', gm_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gm_id, 'role', 'authenticated')::text, true);
  if (select count(*) from public.rosters where owner_id = any (player_ids)) <> 2
    or not exists (select 1 from public.contracts where id = draft_contract)
    or not exists (select 1 from public.handout_images where id = draft_image)
  then
    raise exception 'The GM could not read both rosters and the draft records.';
  end if;
  update public.rosters set supply = supply where owner_id = any (player_ids);
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'The GM could edit a player roster.';
  end if;
end;
$verify$;

rollback;

select 'Hosted campaign checks passed' as result;
