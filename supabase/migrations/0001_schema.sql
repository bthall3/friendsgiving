-- 0001: core schema for Friendsgiving sign-up
create extension if not exists pgcrypto with schema extensions;

create table public.slots (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  position     int  not null,
  claimed_name text,
  dish         text,
  tags         text[] not null default '{}',
  needs        text[] not null default '{}',
  claimed_at   timestamptz,
  updated_at   timestamptz not null default now(),
  constraint slots_category_position_key unique (category, position),
  constraint slots_category_chk check (category in ('side','starch','veg','bread','app','dessert','drink','nocook')),
  constraint slots_name_len_chk check (claimed_name is null or char_length(claimed_name) between 1 and 60),
  constraint slots_dish_len_chk check (dish is null or char_length(dish) between 1 and 80),
  constraint slots_tags_chk check (tags <@ array['vegetarian','vegan','gluten-free','dairy-free','contains-nuts']::text[]),
  constraint slots_needs_chk check (needs <@ array['oven','stovetop','fridge','outlet']::text[])
);

create table public.slot_tokens (
  slot_id    uuid primary key references public.slots(id) on delete cascade,
  token_hash text not null
);

create table public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  attending  boolean not null,
  plus_ones  int not null default 0 check (plus_ones between 0 and 3),
  dietary    text check (dietary is null or char_length(dietary) <= 300),
  created_at timestamptz default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger slots_touch_updated_at
before update on public.slots
for each row execute function public.touch_updated_at();
