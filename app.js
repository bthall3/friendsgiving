(() => {
  "use strict";

  const CFG = window.FG_CONFIG;
  const EVENT_START = Date.parse(CFG.EVENT_START);
  const DEADLINE = Date.parse(CFG.SIGNUP_DEADLINE);
  const TOKENS_KEY = "fg.tokens.v1";
  const NOTE_KEY = "fg.claimNoteShown.v1";

  const ERRORS = {
    slot_taken: "Someone just grabbed that one — pick another.",
    not_authorized: "This browser can't edit that sign-up. Text Braden to change it.",
    invalid_input: "Something in the form isn't valid — check the name and dish (and their lengths).",
    closed: "Sign-ups are closed — the party has started!",
  };

  const $ = (id) => document.getElementById(id);
  const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY);

  let slots = [];
  let tokens = loadTokens();
  let loadFailed = false;

  // ---------- localStorage (may be blocked; degrade gracefully) ----------
  function loadTokens() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TOKENS_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function saveTokens() {
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
      return true;
    } catch {
      return false;
    }
  }
  function flagOnce(key) {
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, "1");
    } catch { /* show it every time if storage is blocked */ }
    return true;
  }

  // ---------- helpers ----------
  const isClosed = () => Date.now() >= EVENT_START;
  const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const labelFor = (list, key) => (list.find((x) => x.key === key) || { label: key }).label;

  function errText(error) {
    const msg = (error && error.message) || "";
    for (const code of Object.keys(ERRORS)) if (msg.includes(code)) return ERRORS[code];
    return "Something went wrong — check your connection and try again.";
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  }

  function setStatus(text, isError = false) {
    const s = $("status");
    s.textContent = text || "";
    s.classList.toggle("error", !!isError);
  }

  // ---------- data ----------
  async function fetchSlots() {
    const { data, error } = await db
      .from("slots")
      .select("id,category,position,claimed_name,dish,tags,needs,claimed_at,updated_at")
      .order("category")
      .order("position");
    if (error) {
      loadFailed = true;
      setStatus("Couldn't load the sign-up board. Refresh to try again.", true);
      return;
    }
    slots = data;
    if (loadFailed) setStatus("");
    loadFailed = false;
    render();
  }

  function patchSlot(row) {
    const i = slots.findIndex((s) => s.id === row.id);
    if (i >= 0) slots[i] = { ...slots[i], ...row };
    else slots.push(row);
    render();
  }

  function subscribe() {
    let wasDown = false;
    db.channel("slots-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, (payload) => {
        if (payload.eventType === "DELETE") {
          slots = slots.filter((s) => s.id !== payload.old.id);
          render();
        } else {
          patchSlot(payload.new);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (wasDown) fetchSlots();
          wasDown = false;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          wasDown = true;
        }
      });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetchSlots();
    });
  }

  // ---------- rendering ----------
  function render() {
    renderHeader();
    renderSummary();
    renderBoard();
    renderMine();
  }

  function renderHeader() {
    if (Date.now() > DEADLINE) {
      $("deadline").textContent = "Sign-ups are past the deadline — still claim if something's open!";
    }
  }

  function renderSummary() {
    const claimed = slots.filter((s) => s.claimed_name).length;
    $("progress").textContent = `${claimed} of ${slots.length} slots claimed`;
    $("cat-counts").replaceChildren(
      ...CFG.CATEGORIES.map((c) => {
        const open = slots.filter((s) => s.category === c.key && !s.claimed_name).length;
        return el("li", {}, `${c.label.split(" (")[0]}: ${open} open`);
      })
    );
  }

  function chipsFor(slot) {
    const chips = [
      ...slot.tags.map((t) => el("span", { class: "chip" }, labelFor(CFG.TAGS, t))),
      ...slot.needs.map((n) => {
        const need = CFG.NEEDS.find((x) => x.key === n) || { icon: "", label: n };
        return el("span", { class: "chip", title: `Needs ${need.label}` }, `${need.icon} needs ${n}`);
      }),
    ];
    return chips.length ? el("div", { class: "chips" }, chips) : null;
  }

  function slotCard(slot) {
    const mine = !!tokens[slot.id];
    if (!slot.claimed_name) {
      return el("li", { class: "slot" },
        el("span", { class: "open-label" }, "Open"),
        el("div", { class: "actions" },
          el("button", {
            class: "btn primary", type: "button", disabled: isClosed(),
            "aria-label": `Claim open ${labelFor(CFG.CATEGORIES, slot.category)} slot`,
            onclick: (e) => openDialog(slot, e.currentTarget),
          }, "Claim"))
      );
    }
    return el("li", { class: mine ? "slot mine" : "slot" },
      el("div", { class: "who" },
        el("strong", {}, slot.claimed_name), " — ", slot.dish,
        chipsFor(slot)),
      mine ? el("div", { class: "actions" },
        el("button", { class: "btn", type: "button", disabled: isClosed(), onclick: (e) => openDialog(slot, e.currentTarget) }, "Edit"),
        el("button", { class: "btn", type: "button", onclick: (e) => release(slot, e.currentTarget) }, "Release")
      ) : null
    );
  }

  function renderBoard() {
    $("board").replaceChildren(
      ...CFG.CATEGORIES.map((c) => {
        const list = slots.filter((s) => s.category === c.key).sort((a, b) => a.position - b.position);
        const open = list.filter((s) => !s.claimed_name).length;
        return el("section", { class: "category", "aria-label": c.label },
          el("h3", {}, c.label, " ", el("span", { class: "count" }, `(${open} open)`)),
          el("ul", { class: "slots" }, list.map(slotCard))
        );
      })
    );
  }

  function renderMine() {
    const mine = slots.filter((s) => tokens[s.id] && s.claimed_name);
    $("mine").hidden = mine.length === 0;
    $("mine-list").replaceChildren(
      ...mine.map((s) => el("li", {}, `${s.dish} (${labelFor(CFG.CATEGORIES, s.category).split(" (")[0]})`))
    );
  }

  // ---------- claim / edit dialog ----------
  const dlg = $("claim-dialog");
  const form = $("claim-form");
  let current = null; // { slot, editing, opener, dupConfirmed }

  function buildChecks(container, list, name) {
    container.replaceChildren(
      ...list.map((item) =>
        el("label", {},
          el("input", { type: "checkbox", name, value: item.key }),
          item.icon ? `${item.icon} ${item.label}` : item.label))
    );
  }
  buildChecks($("c-tags"), CFG.TAGS, "tags");
  buildChecks($("c-needs"), CFG.NEEDS, "needs");

  function openDialog(slot, opener) {
    const editing = !!slot.claimed_name;
    current = { slot, editing, opener, dupConfirmed: false };
    form.reset();
    $("dlg-title").textContent = editing ? "Edit your sign-up" : "Claim a slot";
    $("dlg-cat").textContent = labelFor(CFG.CATEGORIES, slot.category);
    $("dlg-submit").textContent = editing ? "Save" : "Claim";
    $("dlg-submit").disabled = false;
    $("dup-warn").hidden = true;
    setFormMsg("");
    if (editing) {
      $("c-name").value = slot.claimed_name;
      $("c-dish").value = slot.dish;
      for (const box of form.querySelectorAll('input[name="tags"]')) box.checked = slot.tags.includes(box.value);
      for (const box of form.querySelectorAll('input[name="needs"]')) box.checked = slot.needs.includes(box.value);
    }
    dlg.showModal();
    $("c-name").focus();
  }

  function closeDialog() {
    dlg.close();
  }
  dlg.addEventListener("close", () => {
    if (current && current.opener && document.contains(current.opener)) current.opener.focus();
    current = null;
  });
  $("dlg-cancel").addEventListener("click", closeDialog);
  $("c-dish").addEventListener("input", () => {
    if (!current) return;
    current.dupConfirmed = false;
    $("dup-warn").hidden = true;
    $("dlg-submit").textContent = current.editing ? "Save" : "Claim";
  });

  function setFormMsg(text) {
    const m = $("dlg-msg");
    m.textContent = text;
    m.classList.toggle("error", !!text);
  }

  function findDuplicate(dish, exceptId) {
    const d = norm(dish);
    if (!d) return null;
    return slots.find((s) => s.id !== exceptId && s.dish && (norm(s.dish).includes(d) || d.includes(norm(s.dish))));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!current) return;
    const { slot, editing } = current;
    const name = $("c-name").value.trim();
    const dish = $("c-dish").value.trim();
    const tags = [...form.querySelectorAll('input[name="tags"]:checked')].map((b) => b.value);
    const needs = [...form.querySelectorAll('input[name="needs"]:checked')].map((b) => b.value);

    if (!name || !dish) {
      setFormMsg("Please fill in your name and what you're bringing.");
      (name ? $("c-dish") : $("c-name")).focus();
      return;
    }

    const dup = findDuplicate(dish, slot.id);
    if (dup && !current.dupConfirmed) {
      const w = $("dup-warn");
      w.replaceChildren("Someone's already bringing ", el("em", {}, dup.dish), " — still want to add it?");
      w.hidden = false;
      current.dupConfirmed = true;
      $("dlg-submit").textContent = "Yes, add it";
      return;
    }

    const btn = $("dlg-submit");
    btn.disabled = true;
    setFormMsg("");

    if (editing) {
      const { error } = await db.rpc("update_claim", {
        p_slot_id: slot.id, p_token: tokens[slot.id], p_name: name, p_dish: dish, p_tags: tags, p_needs: needs,
      });
      btn.disabled = false;
      if (error) return setFormMsg(errText(error));
      closeDialog();
      fetchSlots();
      return;
    }

    const { data: token, error } = await db.rpc("claim_slot", {
      p_slot_id: slot.id, p_name: name, p_dish: dish, p_tags: tags, p_needs: needs,
    });
    btn.disabled = false;
    if (error) {
      if ((error.message || "").includes("slot_taken")) {
        closeDialog();
        setStatus(ERRORS.slot_taken, true);
        fetchSlots();
      } else {
        setFormMsg(errText(error));
      }
      return;
    }
    tokens[slot.id] = token;
    const stored = saveTokens();
    closeDialog();
    if (!stored) {
      setStatus("You're signed up! (This browser can't save edit access — text Braden to change it.)");
    } else if (flagOnce(NOTE_KEY)) {
      setStatus("You're signed up! Editing works from this device. Text Braden to change it from elsewhere.");
    } else {
      setStatus("You're signed up!");
    }
    fetchSlots();
  });

  async function release(slot, btn) {
    if (!confirm(`Release your sign-up for "${slot.dish}"?`)) return;
    btn.disabled = true;
    const { error } = await db.rpc("release_slot", { p_slot_id: slot.id, p_token: tokens[slot.id] });
    btn.disabled = false;
    if (error) return setStatus(errText(error), true);
    delete tokens[slot.id];
    saveTokens();
    setStatus("Released — thanks for letting us know.");
    fetchSlots();
  }

  // ---------- RSVP ----------
  const rsvpForm = $("rsvp-form");
  const plus = $("r-plus");
  rsvpForm.addEventListener("change", () => {
    plus.disabled = rsvpForm.attending.value === "no";
  });

  rsvpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("rsvp-msg");
    const name = $("r-name").value.trim();
    const attending = rsvpForm.attending.value === "yes";
    if (!name) {
      msg.textContent = "Please add your name.";
      msg.className = "form-msg error";
      $("r-name").focus();
      return;
    }
    // Unlock audio inside the user gesture, before the await.
    Gobble.prime();
    const btn = rsvpForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    const { error } = await db.rpc("submit_rsvp", {
      p_name: name,
      p_attending: attending,
      p_plus_ones: attending ? Number(plus.value) : 0,
      p_dietary: $("r-diet").value.trim() || null,
    });
    btn.disabled = false;
    if (error) {
      msg.textContent = errText(error);
      msg.className = "form-msg error";
      return;
    }
    rsvpForm.reset();
    plus.disabled = false;
    msg.className = "form-msg";
    msg.textContent = attending ? "Got it — see you there! 🦃" : "Thanks for letting us know — we'll miss you!";
    Gobble.celebrate();
  });

  // ---------- Easter egg: synthesized turkey gobble ----------
  // No audio file: a sawtooth voice through a resonant band-pass filter,
  // chopped into ~16 Hz pulses with a falling pitch, in three bursts
  // ("gobble-obble-obble").
  const Gobble = (() => {
    let ctx = null;

    function prime() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = ctx || new AC();
        if (ctx.state === "suspended") ctx.resume();
      } catch { ctx = null; }
    }

    function burst(t0, pulses, startHz, endHz, peak) {
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const amp = ctx.createGain();
      osc.type = "sawtooth";
      filt.type = "bandpass";
      filt.frequency.value = 1300;
      filt.Q.value = 3;
      osc.connect(filt).connect(amp).connect(ctx.destination);

      const pulse = 1 / 16;
      const dur = pulses * pulse;
      osc.frequency.setValueAtTime(startHz, t0);
      osc.frequency.exponentialRampToValueAtTime(endHz, t0 + dur);

      amp.gain.setValueAtTime(0.0001, t0);
      for (let i = 0; i < pulses; i++) {
        const t = t0 + i * pulse;
        const jitter = 0.85 + Math.random() * 0.3;
        // Each pulse also wobbles the pitch up a bit: that's the "gurgle".
        osc.frequency.setValueAtTime(startHz + (endHz - startHz) * (i / pulses) + 120 * jitter, t);
        amp.gain.exponentialRampToValueAtTime(peak * jitter, t + pulse * 0.25);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + pulse * 0.95);
      }
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    function play() {
      if (!ctx) prime();
      if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      burst(t, 7, 950, 620, 0.35);
      burst(t + 0.5, 5, 820, 560, 0.28);
      burst(t + 0.85, 5, 760, 480, 0.22);
    }

    function strut() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const parade = $("turkey-parade");
      const t = el("div", { class: "strut" }, el("span", {}, "🦃"));
      t.addEventListener("animationend", (e) => { if (e.target === t) t.remove(); });
      parade.append(t);
    }

    function celebrate() {
      play();
      strut();
      const hero = $("hero-turkey");
      hero.classList.remove("gobble-pop");
      void hero.offsetWidth; // restart the animation
      hero.classList.add("gobble-pop");
    }

    return { prime, play, celebrate };
  })();

  // The header turkey gobbles on tap too, for anyone who finds it.
  $("hero-turkey").addEventListener("click", () => { Gobble.prime(); Gobble.celebrate(); });

  // ---------- boot ----------
  render();
  fetchSlots();
  subscribe();
  setInterval(renderHeader, 60 * 1000);
})();
