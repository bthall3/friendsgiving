-- 0007: add a "main" category with 2 slots
alter table public.slots drop constraint slots_category_chk;
alter table public.slots add constraint slots_category_chk
  check (category in ('main','side','starch','veg','bread','app','dessert','drink','nocook'));

insert into public.slots (category, position)
select 'main', n from generate_series(1, 2) as n
on conflict (category, position) do nothing;
