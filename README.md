# Experimental Psych Friendsgiving sign-up

Static page (GitHub Pages) + Supabase (Postgres, RLS, RPC, Realtime). Guests claim dish/supply slots, see what's taken live, and RSVP. No logins: edit rights come from a per-claim token stored in the guest's browser.

Full build spec: [`SPEC.md`](SPEC.md).

## Files

| path | what |
|---|---|
| `index.html`, `styles.css`, `app.js` | the page (no build step) |
| `config.js` | Supabase URL + **publishable** key, event times, category labels/order |
| `supabase/migrations/0001…0007` | schema, RLS + RPCs, slot seed, realtime, advisor fixes, slot resize, main-dish category |
| `sql/host_queries.sql` | headcount, open slots, oven/outlet needs, dietary notes, admin fixes |
| `scripts/acceptance.mjs` | race / RLS / token / validation checks using only the anon key |

## Setup

1. Apply `supabase/migrations/*.sql` in order (SQL editor, `supabase db push`, or the Supabase MCP).
2. Put the project's publishable key (`sb_publishable_…`, or the legacy anon key) in `config.js`. **Never** put the `service_role`/secret key in this repo.
3. Run the checks:
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<publishable key> node scripts/acceptance.mjs
   ```
   Then open the page in two browsers and confirm a claim in one shows up in the other within ~2 s.
4. Run Supabase security advisors and clear any RLS/`search_path` warnings.
5. GitHub → Settings → Pages → Deploy from branch `main`, folder `/ (root)`.

## Security model

- RLS on all tables. `anon` can `SELECT` `slots` only; no direct writes anywhere; no read of `slot_tokens` or `rsvps`.
- All writes go through `SECURITY DEFINER` functions (`claim_slot`, `update_claim`, `release_slot`, `submit_rsvp`) with a fixed `search_path`. Validation helpers live in a `private` schema that PostgREST doesn't expose.
- Claims are a single conditional `UPDATE … WHERE claimed_name IS NULL`, so two simultaneous claims can't both win.
- Only SHA-256 hashes of edit tokens are stored.

### Accepted risks

- **No rate limiting or CAPTCHA.** Anyone with the URL can spam RSVPs or claim every slot. Acceptable for a ~30-person event shared via group chat; the host can clean up with `sql/host_queries.sql`.
- **Public site.** GitHub Pages is on the open internet. The street address is deliberately not on the page — it's in the group chat.
- **Names and dishes are public** to anyone with the URL. Dietary notes are not (host-only).
- **Lost tokens.** Clearing browser data or switching devices loses edit access; the host can force-release or edit by hand.
- **Free-tier auto-pause.** Supabase pauses free projects after ~7 days idle. Restore from the dashboard before reuse.

## Reset for a future event

```sql
truncate rsvps;
truncate slot_tokens;
update slots set claimed_name = null, dish = null, tags = '{}', needs = '{}', claimed_at = null;
```

Then update `EVENT_START` / `SIGNUP_DEADLINE` in `config.js` **and** the hard-coded close time in `private.assert_open()` (migration 0002). To change slot counts, `delete from slots` and re-run `0003_seed.sql` with new numbers.

## Easter egg

A "yes" RSVP plays a synthesized turkey gobble (Web Audio, no audio file) and sends a turkey strutting across the screen. Tapping the 🦃 in the header does it too. The strut is skipped for `prefers-reduced-motion`; the sound only plays after a tap, per browser autoplay rules.
