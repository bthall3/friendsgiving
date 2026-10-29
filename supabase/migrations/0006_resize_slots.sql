-- 0006: trim slot counts to 26 (side 5, starch 3, veg 3, bread 1, app 3, dessert 3, drink 4, nocook 4).
-- Only open slots are removed; aborts if any slot being removed is already claimed.
do $$
begin
  if exists (
    select 1 from public.slots s
    join (values ('side',5),('starch',3),('veg',3),('bread',1),('app',3),('dessert',3),('drink',4),('nocook',4)) v(cat, keep)
      on v.cat = s.category
    where s.position > v.keep and s.claimed_name is not null
  ) then
    raise exception 'a slot scheduled for removal is already claimed';
  end if;

  delete from public.slots s
  using (values ('side',5),('starch',3),('veg',3),('bread',1),('app',3),('dessert',3),('drink',4),('nocook',4)) v(cat, keep)
  where v.cat = s.category and s.position > v.keep;
end $$;
