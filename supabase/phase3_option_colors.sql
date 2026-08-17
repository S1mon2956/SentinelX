-- Upgrades template_items.options from text[] (plain choice labels) to
-- jsonb (list of {label, color} objects), so each multiple-choice choice
-- can carry its own customizable colour. Idempotent — safe to re-run;
-- no-ops once options is already jsonb. Existing labels are preserved and
-- given color 'slate' (grey) as a starting point; re-edit and save the
-- template afterwards to assign real colors.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'template_items' and column_name = 'options' and data_type = 'ARRAY'
  ) then
    alter table template_items rename column options to options_old;
    alter table template_items add column options jsonb;
    update template_items
    set options = (
      select jsonb_agg(jsonb_build_object('label', opt, 'color', 'slate'))
      from unnest(options_old) as opt
    )
    where options_old is not null;
    alter table template_items drop column options_old;
  end if;
end $$;
