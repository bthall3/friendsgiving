-- Host queries: paste into the Supabase SQL editor (runs as postgres, bypasses RLS).

-- Headcount (guests + plus-ones who said yes)
select sum(1 + plus_ones) as headcount, count(*) as rsvps_yes
from rsvps where attending;

-- All RSVPs, newest first (spot duplicates here)
select name, attending, plus_ones, dietary, created_at from rsvps order by created_at desc;

-- Open slots by category
select category, count(*) filter (where claimed_name is null) as open, count(*) as total
from slots group by category order by category;

-- Everything needing oven / stovetop / outlet / fridge
select category, claimed_name, dish, needs
from slots where needs && array['oven','stovetop','outlet','fridge']
order by category, position;

-- Outlet count -> how many power strips
select count(*) as outlets_needed from slots where 'outlet' = any(needs);

-- All dietary notes
select name, dietary from rsvps where dietary is not null order by name;

-- Full board
select category, position, claimed_name, dish, tags, needs, claimed_at
from slots order by category, position;

-- ADMIN: force-release a slot (find the id from the full board query above)
-- begin;
-- update slots set claimed_name = null, dish = null, tags = '{}', needs = '{}', claimed_at = null
--  where id = '<slot-uuid>';
-- delete from slot_tokens where slot_id = '<slot-uuid>';
-- commit;

-- ADMIN: edit a claim by hand (guest keeps their edit token)
-- update slots set claimed_name = 'Name', dish = 'Dish', tags = '{vegan}', needs = '{outlet}'
--  where id = '<slot-uuid>';

-- ADMIN: delete a duplicate RSVP
-- delete from rsvps where id = '<rsvp-uuid>';

-- ADMIN: add an extra slot to a category
-- insert into slots (category, position)
-- select 'dessert', coalesce(max(position), 0) + 1 from slots where category = 'dessert';
