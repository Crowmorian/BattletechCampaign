begin;

alter table public.contract_objectives
  add column description text not null default '',
  add column rule_text text not null default '',
  add column completion_reward text not null default '';

grant insert (description, rule_text, completion_reward), update (name, description, rule_text, completion_reward)
  on public.contract_objectives to authenticated;

notify pgrst, 'reload schema';

commit;
