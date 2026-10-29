-- 0003: seed 31 open slots
insert into public.slots (category, position)
select c.category, gs.n
from (values
  ('side', 6), ('starch', 4), ('veg', 4), ('bread', 2),
  ('app', 3), ('dessert', 4), ('drink', 4), ('nocook', 4)
) as c(category, cnt)
cross join lateral generate_series(1, c.cnt) as gs(n)
on conflict (category, position) do nothing;
