begin;

-- Preserve the visibility of existing objectives. New objectives start hidden.
alter table public.contract_objectives add column visible boolean not null default true;
alter table public.contract_objectives alter column visible set default false;

grant update (visible) on public.contract_objectives to authenticated;

alter policy contract_objectives_read_current on public.contract_objectives
  using (visible and exists (
    select 1 from public.campaign_state
    where campaign_state.current_contract_id = contract_objectives.contract_id
  ));

notify pgrst, 'reload schema';

commit;
