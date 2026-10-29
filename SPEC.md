# Friendsgiving Sign-Up — Build Spec (for Claude Code)

## Goal
A single shared sign-up page for a ~30-person psych grad student Friendsgiving. Guests claim dish/supply slots, see what's taken in real time, and RSVP with dietary needs. Host (Braden) is providing the ham.

- **Event:** Saturday, November 7, 2026, 6:00 PM Central (CST, UTC−6 → `2026-11-08T00:00:00Z`)
- **Sign-up deadline (soft):** end of Tuesday, November 3, 2026 CST (`2026-11-04T05:59:59Z`)
- **Stack:** static site on **GitHub Pages** + **Supabase** (Postgres, RLS, RPC functions, Realtime)
- **No logins.** Guests are anonymous; edit rights come from a per-claim token.

---

## 0. Reuse the existing Supabase project — do this first, carefully

Target project: **`minimal-group-demo`** (ref `fnqrkfwdmnroutkttezp`, us-east-1). It is currently **paused (INACTIVE)**.

1. Restore the project from the Supabase dashboard (or ask Braden to). Free tier allows 2 active projects; `PaperTracker` is already active, so this makes 2 — do **not** pause or touch `PaperTracker` or `Wingman`.
2. **Inventory before deleting anything.** List all objects in the `public` schema (tables, views, functions, triggers, types, policies), any Edge Functions, and Storage buckets. Report row counts per table to Braden.
3. **Back up** every `public` table: `pg_dump --schema=public --data-only` (or CSV export per table) to `backup/minimal-group-demo-YYYYMMDD/` **outside the git repo** (add `backup/` to `.gitignore`).
4. **Stop and get explicit confirmation from Braden** that the inventory can be dropped. If any table contains participant/research data, do not proceed.
5. Drop only the demo's own objects in `public` (and its Edge Functions/buckets, if any). **Never** modify Supabase-managed schemas (`auth`, `storage`, `realtime`, `extensions`, `supabase_*`).
6. Optionally rename the project to `friendsgiving` in dashboard settings (cosmetic; the ref/URL doesn't change).

All new schema goes in as SQL migration files under `supabase/migrations/` and is applied in order.

---

## 1. Data model

Enable `pgcrypto` (for `gen_random_uuid()`, `gen_random_bytes()`, `digest()`).

### `slots` (publicly readable)
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `category` | `text` not null | one of the categories below |
| `position` | `int` not null | ordering within category |
| `claimed_name` | `text` null | ≤ 60 chars; null = open |
| `dish` | `text` null | ≤ 80 chars |
| `tags` | `text[]` not null default `'{}'` | subset of: `vegetarian`, `vegan`, `gluten-free`, `dairy-free`, `contains-nuts` |
| `needs` | `text[]` not null default `'{}'` | subset of: `oven`, `stovetop`, `fridge`, `outlet` (empty = ready to serve) |
| `claimed_at` | `timestamptz` null | |
| `updated_at` | `timestamptz` not null default `now()` | trigger-maintained |

Unique `(category, position)`. Check constraints enforce lengths and allowed `tags`/`needs` values (`tags <@ array[...]`).

### `slot_tokens` (private)
| column | type |
|---|---|
| `slot_id` | `uuid` PK, FK → `slots.id` on delete cascade |
| `token_hash` | `text` not null (hex SHA-256 of the raw token) |

### `rsvps` (private — host-only)
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` not null | ≤ 60 |
| `attending` | `boolean` not null | |
| `plus_ones` | `int` not null default 0 | 0–3 (plus-ones confirmed allowed; cap is a sanity limit) |
| `dietary` | `text` null | ≤ 300; allergies/restrictions |
| `created_at` | `timestamptz` default `now()` | |

### Seed slots (31)
| category key | display label | count |
|---|---|---|
| `side` | Sides | 6 |
| `starch` | Starches (potatoes, stuffing, mac) | 4 |
| `veg` | Veggies & salads | 4 |
| `bread` | Rolls & bread | 2 |
| `app` | Appetizers | 3 |
| `dessert` | Desserts | 4 |
| `drink` | Drinks (non-alcoholic, wine, beer — alcohol confirmed OK) | 4 |
| `nocook` | No-cook (ice, cups, napkins, to-go containers) | 4 |

Seed as a migration (`insert ... generate_series`). Category display labels and order live in the frontend config, not the DB.

---

## 2. Security model (the important part)

- **RLS enabled on all three tables.**
- `anon` role: `SELECT` on `slots` only, via a permissive `select` policy. **No** direct `INSERT/UPDATE/DELETE` on any table — revoke them explicitly.
- `anon` has **no** `SELECT` on `slot_tokens` or `rsvps`.
- All writes go through `SECURITY DEFINER` RPC functions with `SET search_path = public, extensions`, owned by `postgres`, `EXECUTE` granted to `anon`.
- Frontend uses only the **publishable/anon key**. The `service_role` key must never appear in the repo or the browser.

### RPC functions

**`claim_slot(p_slot_id uuid, p_name text, p_dish text, p_tags text[], p_needs text[]) returns text`**
- Trim + validate inputs (lengths, allowed values, non-empty name and dish).
- Reject if `now() >= '2026-11-08T00:00:00Z'` (event started).
- **Atomic claim:** `UPDATE slots SET ... WHERE id = p_slot_id AND claimed_name IS NULL RETURNING id`. If no row returned → raise `'slot_taken'`. No check-then-write.
- Generate raw token `encode(gen_random_bytes(24), 'hex')`, store `encode(digest(token,'sha256'),'hex')` in `slot_tokens` (upsert), return the raw token.

**`update_claim(p_slot_id uuid, p_token text, p_name text, p_dish text, p_tags text[], p_needs text[]) returns void`**
- Verify token hash matches; else raise `'not_authorized'`. Same validation as claim.

**`release_slot(p_slot_id uuid, p_token text) returns void`**
- Verify token; null out claim fields; delete `slot_tokens` row.

**`submit_rsvp(p_name text, p_attending boolean, p_plus_ones int, p_dietary text) returns void`**
- Validate and insert. Insert-only; guests can't read or edit RSVPs (host fixes duplicates manually).

Errors are raised with stable message codes (`slot_taken`, `not_authorized`, `invalid_input`, `closed`) the frontend maps to friendly text.

No rate limiting or CAPTCHA — unguessable URL + the above is sufficient for this audience. Note this in the README as an accepted risk.

---

## 3. Realtime
- Add `slots` to the `supabase_realtime` publication.
- Frontend subscribes to `postgres_changes` on `public.slots` (all events) and patches the in-memory board. On reconnect/visibility change, refetch the full slot list.

---

## 4. Frontend

### Tech
- Plain HTML/CSS/JS, no build step: `index.html`, `styles.css`, `app.js`, `config.js`.
- `@supabase/supabase-js` v2 loaded from jsDelivr with an **exact pinned version**.
- `config.js` holds `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, event constants, category labels/order. (These are public by design.)

### Page layout (mobile-first, works at 375px, no horizontal scroll)
1. **Header:** "Psych Grad Friendsgiving", Sat Nov 7 · 6 PM, "Host is bringing the ham + plates." Deadline line: "Please sign up by Tue Nov 3." After the deadline, change to "Sign-ups are past the deadline — still claim if something's open!" (soft only).
2. **Oven notice (prominent):** "The oven is busy with ham all afternoon — please bring your dish ready to serve. Crockpots welcome (tell us you need an outlet)."
3. **Progress summary:** "X of 31 slots claimed" + per-category open counts.
4. **Slot board:** grouped by category in configured order. Each slot card shows either **Open** (button: "Claim") or **Name — Dish** with tag chips and a needs icon. Slots claimed from this browser show **Edit** / **Release**.
5. **Claim/edit dialog:** name, dish, tag checkboxes, needs checkboxes (default none). **Soft duplicate warning:** if the dish name loosely matches an existing claimed dish (case-insensitive, normalized whitespace, substring either way), show "Someone's already bringing *Mac and cheese* — still want to add it?" before submitting.
6. **RSVP section:** name, attending yes/no, number of plus-ones (0–3, helper text "Plus-ones welcome!"), dietary needs (textarea, with helper text "Only the host sees this").
7. **"Your sign-ups"** list at top when this browser holds any tokens.

### Token handling
- Store `{slotId: token}` in `localStorage` under one key; wrap every read/write in `try/catch` and degrade gracefully (claiming still works; edit/release just won't be offered). Show a one-time note after claiming: "Editing works from this device. Text Braden to change it from elsewhere."

### UX details
- Optimistic UI is **not** required; disable the button while the RPC runs, then rely on the response + realtime.
- On `slot_taken`, show "Someone just grabbed that one — pick another" and refresh.
- Respect `prefers-color-scheme`; accessible labels, focus management in the dialog, ≥ 44px tap targets.
- Do **not** put the street address on the page (see Open questions).

---

## 5. Host tools (no admin UI)
Create `sql/host_queries.sql` with ready-to-paste queries for the Supabase SQL editor:
- Headcount: `sum(1 + plus_ones) where attending`
- Open slots by category
- Everything needing `oven`, `stovetop`, or `outlet` (count outlets → power strips)
- All dietary notes from RSVPs
- Admin fixes: force-release a slot (`update slots set ... ; delete from slot_tokens ...`), edit a claim by hand

---

## 6. Repo & deploy
```
friendsgiving-signup/
  index.html  styles.css  app.js  config.js
  supabase/migrations/0001_schema.sql
  supabase/migrations/0002_rls_and_rpc.sql
  supabase/migrations/0003_seed.sql
  supabase/migrations/0004_realtime.sql
  sql/host_queries.sql
  README.md   .gitignore
```
- Public GitHub repo; GitHub Pages from `main` branch root. No Actions required.
- README: setup steps, how to reset slots for a future event (truncate claims, reseed), and the accepted risks.

---

## 7. Acceptance checks (run before sharing the link)
1. **Race:** fire two `claim_slot` calls for the same slot concurrently (e.g., `Promise.all` in a Node script with the anon key) → exactly one succeeds, the other gets `slot_taken`.
2. **RLS:** with the anon key, `select * from rsvps` and `slot_tokens` return nothing/denied; direct `update slots` / `delete from slots` fail.
3. **Token:** release with a wrong token → `not_authorized`; with the right token → slot reopens.
4. **Realtime:** claim in browser A → browser B updates within ~2 s without reload.
5. **Validation:** over-length strings and unknown tags are rejected server-side.
6. **Mobile:** layout correct at 375px width; dialog usable with on-screen keyboard.
7. **localStorage blocked** (private mode): page still loads and claiming works.
8. Run Supabase security advisors; resolve any RLS/`search_path` warnings.

---

## 8. Out of scope
User accounts, email notifications, admin dashboard, multiple events, payments/cost splitting.

## 9. Open questions for Braden (answer before building)
- **Address:** a public GitHub Pages site is on the open internet. Recommend sharing the address in the group chat, not on the page. (Pages from a private repo requires a paid GitHub plan.)
- **Supabase auto-pause:** free projects pause after ~7 days of inactivity. Fine through Nov 7, but expect it to pause afterward if reused for future events.
