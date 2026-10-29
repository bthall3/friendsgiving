-- 0002: RLS, grants, and the only write paths (SECURITY DEFINER RPCs)

alter table public.slots       enable row level security;
alter table public.slot_tokens enable row level security;
alter table public.rsvps       enable row level security;

-- anon/authenticated: read slots only; no direct writes anywhere.
revoke all on public.slots, public.slot_tokens, public.rsvps from anon, authenticated;
grant select on public.slots to anon, authenticated;

create policy "slots are publicly readable"
  on public.slots for select
  to anon, authenticated
  using (true);
-- No policies on slot_tokens / rsvps => no rows visible even if a grant slips in.

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- Private helpers live outside the PostgREST-exposed schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.clean_claim(
  p_name text, p_dish text, p_tags text[], p_needs text[],
  out o_name text, out o_dish text, out o_tags text[], out o_needs text[])
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  o_name  := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  o_dish  := btrim(regexp_replace(coalesce(p_dish, ''), '\s+', ' ', 'g'));
  o_tags  := coalesce(array(select distinct unnest(p_tags) order by 1), '{}');
  o_needs := coalesce(array(select distinct unnest(p_needs) order by 1), '{}');

  if char_length(o_name) not between 1 and 60
     or char_length(o_dish) not between 1 and 80
     or array_position(o_tags, null) is not null
     or array_position(o_needs, null) is not null
     or not (o_tags  <@ array['vegetarian','vegan','gluten-free','dairy-free','contains-nuts']::text[])
     or not (o_needs <@ array['oven','stovetop','fridge','outlet']::text[]) then
    raise exception 'invalid_input';
  end if;
end;
$$;

create or replace function private.assert_open()
returns void
language plpgsql
stable
as $$
begin
  if now() >= timestamptz '2026-11-08T00:00:00Z' then
    raise exception 'closed';
  end if;
end;
$$;

create or replace function private.token_ok(p_slot_id uuid, p_token text)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.slot_tokens
    where slot_id = p_slot_id
      and p_token is not null
      and token_hash = encode(digest(p_token, 'sha256'), 'hex')
  );
$$;

-- claim_slot ---------------------------------------------------------------
create or replace function public.claim_slot(
  p_slot_id uuid, p_name text, p_dish text, p_tags text[], p_needs text[])
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c record;
  v_id uuid;
  v_token text;
begin
  perform private.assert_open();
  select * into c from private.clean_claim(p_name, p_dish, p_tags, p_needs);

  -- Atomic: only succeeds if still open. No check-then-write.
  update public.slots
     set claimed_name = c.o_name, dish = c.o_dish, tags = c.o_tags,
         needs = c.o_needs, claimed_at = now()
   where id = p_slot_id and claimed_name is null
  returning id into v_id;

  if v_id is null then
    raise exception 'slot_taken';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.slot_tokens (slot_id, token_hash)
  values (v_id, encode(digest(v_token, 'sha256'), 'hex'))
  on conflict (slot_id) do update set token_hash = excluded.token_hash;

  return v_token;
end;
$$;

-- update_claim -------------------------------------------------------------
create or replace function public.update_claim(
  p_slot_id uuid, p_token text, p_name text, p_dish text, p_tags text[], p_needs text[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c record;
begin
  if not private.token_ok(p_slot_id, p_token) then
    raise exception 'not_authorized';
  end if;
  perform private.assert_open();
  select * into c from private.clean_claim(p_name, p_dish, p_tags, p_needs);

  update public.slots
     set claimed_name = c.o_name, dish = c.o_dish, tags = c.o_tags, needs = c.o_needs
   where id = p_slot_id;
end;
$$;

-- release_slot -------------------------------------------------------------
create or replace function public.release_slot(p_slot_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not private.token_ok(p_slot_id, p_token) then
    raise exception 'not_authorized';
  end if;

  update public.slots
     set claimed_name = null, dish = null, tags = '{}', needs = '{}', claimed_at = null
   where id = p_slot_id;
  delete from public.slot_tokens where slot_id = p_slot_id;
end;
$$;

-- submit_rsvp --------------------------------------------------------------
create or replace function public.submit_rsvp(
  p_name text, p_attending boolean, p_plus_ones int, p_dietary text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_diet text := nullif(btrim(coalesce(p_dietary, '')), '');
begin
  if char_length(v_name) not between 1 and 60
     or p_attending is null
     or coalesce(p_plus_ones, -1) not between 0 and 3
     or char_length(coalesce(v_diet, '')) > 300 then
    raise exception 'invalid_input';
  end if;

  insert into public.rsvps (name, attending, plus_ones, dietary)
  values (v_name, p_attending, case when p_attending then p_plus_ones else 0 end, v_diet);
end;
$$;

-- Ownership + execute grants ------------------------------------------------
alter function public.claim_slot(uuid, text, text, text[], text[])         owner to postgres;
alter function public.update_claim(uuid, text, text, text, text[], text[]) owner to postgres;
alter function public.release_slot(uuid, text)                             owner to postgres;
alter function public.submit_rsvp(text, boolean, int, text)                owner to postgres;

revoke execute on function public.claim_slot(uuid, text, text, text[], text[])         from public;
revoke execute on function public.update_claim(uuid, text, text, text, text[], text[]) from public;
revoke execute on function public.release_slot(uuid, text)                             from public;
revoke execute on function public.submit_rsvp(text, boolean, int, text)                from public;

grant execute on function public.claim_slot(uuid, text, text, text[], text[])         to anon, authenticated;
grant execute on function public.update_claim(uuid, text, text, text, text[], text[]) to anon, authenticated;
grant execute on function public.release_slot(uuid, text)                             to anon, authenticated;
grant execute on function public.submit_rsvp(text, boolean, int, text)                to anon, authenticated;
