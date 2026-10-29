// Acceptance checks 1, 2, 3, 5 from SPEC.md against the live project, using only the anon key.
// Usage: SUPABASE_URL=... SUPABASE_KEY=<publishable key> node scripts/acceptance.mjs
// Claims one slot temporarily and releases it at the end. Inserts nothing into rsvps.
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) throw new Error("Set SUPABASE_URL and SUPABASE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const rest = (path, init = {}) => fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...init.headers } });
const rpc = async (fn, body) => {
  const r = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text ? JSON.parse(text) : null };
};
let failed = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) failed++;
};

const open = await (await rest("slots?select=id&claimed_name=is.null&limit=1")).json();
const slotId = open[0].id;

// 1. Race
const args = (n) => ({ p_slot_id: slotId, p_name: `racer${n}`, p_dish: "test chips", p_tags: [], p_needs: [] });
const results = await Promise.all([1, 2, 3, 4].map((n) => rpc("claim_slot", args(n))));
const winners = results.filter((r) => r.ok);
const losers = results.filter((r) => !r.ok && r.body?.message === "slot_taken");
check("race: exactly one claim wins", winners.length === 1 && losers.length === 3,
  JSON.stringify(results.map((r) => r.ok || r.body?.message)));
const token = winners[0]?.body;

// 2. RLS
for (const t of ["rsvps", "slot_tokens"]) {
  const r = await rest(`${t}?select=*`);
  const body = await r.json();
  check(`rls: anon cannot read ${t}`, !r.ok || (Array.isArray(body) && body.length === 0), `${r.status}`);
}
const upd = await rest(`slots?id=eq.${slotId}`, { method: "PATCH", body: JSON.stringify({ dish: "hacked" }), headers: { Prefer: "return=representation" } });
const updBody = await upd.json();
check("rls: anon cannot update slots", !upd.ok || updBody.length === 0, `${upd.status}`);
const del = await rest(`slots?id=eq.${slotId}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
const delBody = await del.json();
check("rls: anon cannot delete slots", !del.ok || delBody.length === 0, `${del.status}`);
const ins = await rest("rsvps", { method: "POST", body: JSON.stringify({ name: "x", attending: true }) });
check("rls: anon cannot insert rsvps directly", !ins.ok, `${ins.status}`);

// 5. Validation
const other = await (await rest("slots?select=id&claimed_name=is.null&limit=1")).json();
const bad = [
  ["long name", { p_name: "a".repeat(61), p_dish: "x", p_tags: [], p_needs: [] }],
  ["long dish", { p_name: "a", p_dish: "x".repeat(81), p_tags: [], p_needs: [] }],
  ["unknown tag", { p_name: "a", p_dish: "x", p_tags: ["keto"], p_needs: [] }],
  ["unknown need", { p_name: "a", p_dish: "x", p_tags: [], p_needs: ["grill"] }],
  ["blank name", { p_name: "   ", p_dish: "x", p_tags: [], p_needs: [] }],
];
for (const [name, a] of bad) {
  const r = await rpc("claim_slot", { p_slot_id: other[0].id, ...a });
  check(`validation: ${name} rejected`, !r.ok && r.body?.message === "invalid_input", r.body?.message);
}
const rv = await rpc("submit_rsvp", { p_name: "a", p_attending: true, p_plus_ones: 4, p_dietary: null });
check("validation: plus_ones > 3 rejected", !rv.ok && rv.body?.message === "invalid_input", rv.body?.message);

// 3. Token
const wrong = await rpc("release_slot", { p_slot_id: slotId, p_token: "nope" });
check("token: wrong token -> not_authorized", !wrong.ok && wrong.body?.message === "not_authorized", wrong.body?.message);
const right = await rpc("release_slot", { p_slot_id: slotId, p_token: token });
const after = await (await rest(`slots?select=claimed_name&id=eq.${slotId}`)).json();
check("token: right token reopens slot", right.ok && after[0].claimed_name === null);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
