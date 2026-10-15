/* Life Style: pure logic (no DOM, no Firebase), so it can be tested with `node --test tests/`.
   Dates are local YYYY-MM-DD strings, the same as the rest of the app. */

export const TASK_TYPES = ["boolean", "count", "duration", "quantity"];
export const CATS = ["mind", "body", "social", "sleep", "learning", "health", "other"];
export const SLOTS = ["morning", "afternoon", "evening", "anytime"];
export const REASONS = ["no_time", "low_energy", "forgot", "too_hard", "not_relevant", "other"];
export const RECUR_KINDS = ["daily", "days", "once"];
export const UNDO_MS = 10 * 60 * 1000;   /* how long after End Day the day can be reopened */
export const SUCCESS_PCT = 0.5;          /* a day counts toward the streak at this completion or more */
export const MAX_TASKS = 40;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/* ---------- dates ---------- */
export function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
/* Mon = 1 ... Sun = 7 */
export function weekday(s) { const g = parseISO(s).getDay(); return g === 0 ? 7 : g; }
export function mondayOf(s) { return addDays(s, 1 - weekday(s)); }

/* ---------- tasks ---------- */

/* How much one +/- tap changes a value. */
export function stepFor(t) {
  if (t.type === "duration") return 5;
  if (t.type === "quantity" && /^(l|ltr|litre|litres|liter|liters)$/i.test(t.unit)) return 0.5;
  return 1;
}

/* Checks and tidies a task definition from the form or the AI. Returns { ok, task } or { ok: false, errors }.
   `now` and `id` are passed in so the function stays pure. */
export function validateTask(raw, { id, now = 0 } = {}) {
  const errors = [];
  const r = raw && typeof raw === "object" ? raw : {};
  const title = clean(r.title, 60);
  if (!title) errors.push("Give the task a name.");
  const type = TASK_TYPES.includes(r.type) ? r.type : null;
  if (!type) errors.push("Pick a task type.");
  let target = 1, unit = "";
  if (type && type !== "boolean") {
    target = Number(r.target);
    if (!Number.isFinite(target) || target <= 0) errors.push("Set a target above zero.");
    else if (target > 10000) errors.push("That target is too large.");
    unit = type === "duration" ? "min" : clean(r.unit, 16);
    if (type !== "duration" && !unit) errors.push("Add a unit, for example pages.");
    target = round(target);
  }
  const cat = CATS.includes(r.cat) ? r.cat : "other";
  const slot = SLOTS.includes(r.slot) ? r.slot : "anytime";
  const d = Math.round(Number(r.diff));
  const diff = d >= 1 && d <= 3 ? d : 1;
  const recur = cleanRecur(r.recur);
  if (!recur) errors.push("Choose when it repeats.");
  else if (recur.kind === "days" && !recur.days.length) errors.push("Pick at least one weekday.");
  else if (recur.kind === "once" && !DATE_RE.test(recur.date)) errors.push("Pick a date.");
  if (errors.length) return { ok: false, errors };
  const task = {
    id: id || clean(r.id, 40),
    title, type, target, unit, cat, slot, diff,
    why: clean(r.why, 140),
    source: r.source === "ai" ? "ai" : "manual",
    recur, active: r.active !== false,
    created: Number.isFinite(r.created) ? r.created : now,
  };
  if (r.goalId) task.goalId = clean(r.goalId, 40);
  if (!task.id) return { ok: false, errors: ["Missing id."] };
  return { ok: true, task };
}

function cleanRecur(rc) {
  if (!rc || !RECUR_KINDS.includes(rc.kind)) return null;
  if (rc.kind === "daily") return { kind: "daily" };
  if (rc.kind === "once") return { kind: "once", date: clean(rc.date, 10) };
  const days = [...new Set((Array.isArray(rc.days) ? rc.days : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))].sort();
  return { kind: "days", days };
}

export function occursOn(task, date) {
  if (!task || task.active === false) return false;
  const rc = task.recur || { kind: "daily" };
  if (rc.kind === "daily") return true;
  if (rc.kind === "days") return rc.days.includes(weekday(date));
  if (rc.kind === "once") return rc.date === date;
  return false;
}

/* ---------- a day ---------- */

export function snapOf(t) {
  return { title: t.title, type: t.type, target: t.target, unit: t.unit, cat: t.cat, slot: t.slot, step: stepFor(t) };
}

/* A fresh open day with an instance for every task due that date. */
export function buildDay(tasks, date) {
  const list = Object.values(tasks || {}).filter(t => occursOn(t, date)).sort(bySlot);
  return { date, status: "open", tasks: list.map(t => ({ id: t.id, snap: snapOf(t), value: 0 })), reasons: {}, updated: 0 };
}

const SLOT_ORDER = Object.fromEntries(SLOTS.map((s, i) => [s, i]));
function bySlot(a, b) {
  return (SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]) || ((a.created || 0) - (b.created || 0));
}

export function isDone(inst) {
  const need = inst.snap.type === "boolean" ? 1 : inst.snap.target;
  return (inst.value || 0) >= need - 1e-9;
}

/* 0..1 for one task. Boolean is all or nothing. */
export function instPct(inst) {
  if (inst.snap.type === "boolean") return isDone(inst) ? 1 : 0;
  return Math.max(0, Math.min(1, (inst.value || 0) / inst.snap.target));
}

/* Share of tasks done, 0..1, or null when the day has no tasks. A task counts when its target is met. */
export function dayPct(day) {
  const n = day.tasks.length;
  if (!n) return null;
  return day.tasks.filter(isDone).length / n;
}

export function setValue(inst, v) {
  const max = inst.snap.type === "boolean" ? 1 : inst.snap.target * 10;
  inst.value = round(Math.max(0, Math.min(max, Number(v) || 0)));
  return inst;
}

/* Tick: finish the task, or take it back to zero if it was already finished. */
export function toggleDone(inst) {
  if (isDone(inst)) return setValue(inst, 0);
  return setValue(inst, inst.snap.type === "boolean" ? 1 : inst.snap.target);
}

export function bump(inst, dir) {
  return setValue(inst, (inst.value || 0) + dir * inst.snap.step);
}

/* Timers for duration tasks. `run` is the ms a timer started. Stopping adds the elapsed minutes. */
export function startTimer(inst, now) { if (inst.run == null) inst.run = now; return inst; }
export function stopTimer(inst, now) {
  if (inst.run != null) { setValue(inst, (inst.value || 0) + Math.max(0, now - inst.run) / 60000); delete inst.run; }
  return inst;
}
export function liveValue(inst, now) {
  return (inst.value || 0) + (inst.run != null ? Math.max(0, now - inst.run) / 60000 : 0);
}

/* Ends a day. Reasons are kept only for tasks that are not done and only if the code is known.
   Works with any amount done, including nothing. auto=true marks a day closed by the app. */
export function endDay(day, { reasons = {}, now = 0, auto = false } = {}) {
  if (day.status !== "open") return day;
  day.tasks.forEach(i => stopTimer(i, now));
  const kept = {};
  for (const i of day.tasks) {
    const code = reasons[i.id];
    if (!isDone(i) && REASONS.includes(code)) kept[i.id] = code;
  }
  day.reasons = auto ? {} : kept;
  day.status = auto ? "auto" : "ended";
  day.endedAt = now;
  day.updated = now;
  return day;
}

/* A day ended a moment ago can be reopened. Rest days and auto-closed days follow the same rule. */
export function canUndo(day, now) {
  return day.status !== "open" && !!day.endedAt && now - day.endedAt <= UNDO_MS;
}
export function undoEndDay(day, now) {
  if (!canUndo(day, now)) return day;
  day.status = "open";
  day.reasons = {};
  delete day.restDay;
  delete day.endedAt;
  day.updated = now;
  return day;
}

/* One rest day per Monday-to-Sunday week. */
export function canRest(days, date) {
  const wk = mondayOf(date), d = days[date];
  if (d && d.status !== "open") return false;
  return !Object.values(days).some(x => x.restDay && x.date !== date && mondayOf(x.date) === wk);
}
export function restDay(day, now) {
  if (day.status !== "open") return day;
  day.tasks.forEach(i => stopTimer(i, now));
  day.restDay = true;
  day.status = "ended";
  day.endedAt = now;
  day.updated = now;
  return day;
}

/* Days still open from before `today` close on their own: no reasons asked, no judgement. */
export function autoCloseStale(days, today, now) {
  const closed = [];
  for (const d of Object.values(days)) {
    if (d.status === "open" && d.date < today) { endDay(d, { now, auto: true }); closed.push(d.date); }
  }
  return closed;
}

/* Brings a task change into an open day: adds, updates or removes its instance. */
export function syncTaskIntoDay(day, task) {
  if (!day || day.status !== "open") return day;
  const i = day.tasks.findIndex(x => x.id === task.id);
  const due = occursOn(task, day.date);
  if (!due) {
    if (i >= 0 && !(day.tasks[i].value > 0)) day.tasks.splice(i, 1);
    return day;
  }
  if (i >= 0) day.tasks[i].snap = snapOf(task);
  else {
    day.tasks.push({ id: task.id, snap: snapOf(task), value: 0 });
    day.tasks.sort((a, b) => (SLOT_ORDER[a.snap.slot] - SLOT_ORDER[b.snap.slot]));
  }
  return day;
}

/* ---------- streak ---------- */

/* A day's result: "ok" (met SUCCESS_PCT), "short", "rest" (rest day) or "none" (nothing scheduled). */
export function dayResult(day) {
  if (day.restDay) return "rest";
  const p = dayPct(day);
  if (p === null) return "none";
  return p >= SUCCESS_PCT ? "ok" : "short";
}

/* Consecutive good days ending today. Rest days and days with no tasks keep the streak but don't add to it.
   Today never breaks it while it is still open. A day with no record, or one that fell short, ends it. */
export function streak(days, today) {
  let n = 0, d = today;
  const t = days[today];
  if (!t || t.status === "open") d = addDays(today, -1);
  for (let guard = 0; guard < 400; guard++) {
    const x = days[d];
    if (!x) break;
    const r = x.status === "open" ? "short" : dayResult(x);
    if (r === "ok") n++;
    else if (r !== "rest" && r !== "none") break;
    d = addDays(d, -1);
  }
  return n;
}

/* ---------- history for the AI ---------- */

/* Per task title over the last `n` days: how often it was done and why it was skipped. Only closed days count,
   rest days are left out, and an open day never counts against a task. Sent to the AI so plans adapt. */
export function historyFor(days, today, n = 14, max = 30) {
  const from = addDays(today, -n), by = new Map();
  for (const d of Object.values(days)) {
    if (d.date < from || d.date >= today || d.status === "open" || d.restDay) continue;
    for (const i of d.tasks) {
      const k = i.snap.title.toLowerCase();
      const h = by.get(k) || { title: i.snap.title, type: i.snap.type, target: i.snap.target, unit: i.snap.unit, days: 0, done: 0, reasons: {}, last: "" };
      h.days++;
      if (isDone(i)) h.done++;
      else if (d.reasons && REASONS.includes(d.reasons[i.id])) h.reasons[d.reasons[i.id]] = (h.reasons[d.reasons[i.id]] || 0) + 1;
      if (d.date >= h.last) Object.assign(h, { last: d.date, type: i.snap.type, target: i.snap.target, unit: i.snap.unit });
      by.set(k, h);
    }
  }
  return [...by.values()].map(({ last, done, ...h }) => ({ ...h, rate: round(done / h.days) })).slice(0, max);
}

/* ---------- summaries ---------- */
export const SUM_TYPES = ["workout", "lifestyle", "combined", "weekly"];
export const MAX_REGEN = 2;          /* regenerations allowed per summary */
export const MAX_ADJUSTMENTS = 3;    /* approved adjustments carried into the next plan */

export function sumId(type, date) { return `sum_${type}_${date}`; }
export function canRegen(sum) { return (sum.regen || 0) < MAX_REGEN; }

/* One day as the AI sees it. Reasons are only included for tasks that were not done. */
export function dayPayload(day) {
  return {
    date: day.date, pct: dayPct(day), status: day.status, rest: !!day.restDay,
    tasks: day.tasks.map(i => ({
      title: i.snap.title, type: i.snap.type, target: i.snap.target, unit: i.snap.unit,
      value: round(i.value || 0, 1), done: isDone(i),
      ...(!isDone(i) && day.reasons && day.reasons[i.id] ? { reason: day.reasons[i.id] } : {}),
    })),
  };
}

/* The last n days up to and including `to`, one row each, for spotting links between life tasks and workouts.
   work: { date: { vol (kg), sets } }. pct and sleep are null when there is nothing to measure that day;
   an open day or a rest day has no pct. */
export function trendFor(days, work, to, n = 14) {
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = addDays(to, -k), day = days[d], w = work[d] || {};
    let pct = null, sleep = null;
    if (day && day.status !== "open" && !day.restDay) {
      pct = dayPct(day);
      const s = day.tasks.filter(i => i.snap.cat === "sleep");
      if (s.length) sleep = round(s.reduce((a, i) => a + instPct(i), 0) / s.length);
    }
    out.push({ d, pct: pct === null ? null : round(pct), sleep, vol: Math.round(w.vol || 0), sets: w.sets || 0 });
  }
  return out;
}

/* Adds approved adjustments (text) to the list carried into the next plan, newest last, at most MAX_ADJUSTMENTS. */
export function toggleAdjustment(list, text) {
  const t = String(text).replace(/\s+/g, " ").trim().slice(0, 200);
  const i = list.indexOf(t);
  if (i >= 0) return list.filter((_, j) => j !== i);
  return [...list, t].slice(-MAX_ADJUSTMENTS);
}

/* ---------- dashboard ---------- */

/* Days that count in the stats: closed, not a rest day, with at least one task. */
function counted(days, to, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const d = days[addDays(to, -k)];
    if (d && d.status !== "open" && !d.restDay && d.tasks.length) out.push(d);
  }
  return out;
}

/* Share of tasks done over the last n days up to `to`. */
export function completion(days, to, n) {
  const list = counted(days, to, n);
  const tasks = list.reduce((a, d) => a + d.tasks.length, 0);
  const done = list.reduce((a, d) => a + d.tasks.filter(isDone).length, 0);
  return { pct: tasks ? round(done / tasks) : null, days: list.length, tasks, done };
}

/* The task left undone most often, with its most common reason. Needs 3 days of it and 2 misses to say anything. */
export function mostSkipped(days, to, n = 30) {
  const by = new Map();
  for (const d of counted(days, to, n)) {
    for (const i of d.tasks) {
      const k = i.snap.title.toLowerCase();
      const h = by.get(k) || { title: i.snap.title, days: 0, missed: 0, reasons: {} };
      h.days++;
      if (!isDone(i)) {
        h.missed++;
        const r = d.reasons && d.reasons[i.id];
        if (REASONS.includes(r)) h.reasons[r] = (h.reasons[r] || 0) + 1;
      }
      by.set(k, h);
    }
  }
  const top = [...by.values()].filter(h => h.days >= 3 && h.missed >= 2)
    .sort((a, b) => b.missed - a.missed || b.missed / b.days - a.missed / a.days)[0];
  if (!top) return null;
  const reason = Object.entries(top.reasons).sort((a, b) => b[1] - a[1])[0];
  return { title: top.title, missed: top.missed, days: top.days, reason: reason ? reason[0] : null };
}

/* The time of day when tasks get done most. Needs two slots with 5 or more tasks each, otherwise there is nothing to compare. */
export function bestSlot(days, to, n = 30) {
  const by = {};
  for (const d of counted(days, to, n)) for (const i of d.tasks) {
    const s = by[i.snap.slot] || (by[i.snap.slot] = { n: 0, done: 0 });
    s.n++; if (isDone(i)) s.done++;
  }
  const list = Object.entries(by).filter(([, s]) => s.n >= 5).map(([slot, s]) => ({ slot, pct: round(s.done / s.n) }));
  if (list.length < 2) return null;
  return list.sort((a, b) => b.pct - a.pct)[0];
}

/* The longest run of good days in the data. Same rules as streak(); an open day neither adds nor breaks. */
export function longestStreak(days) {
  const dates = Object.keys(days).sort();
  if (!dates.length) return 0;
  let best = 0, run = 0, d = dates[0];
  const end = dates[dates.length - 1];
  for (let guard = 0; d <= end && guard < 1000; guard++, d = addDays(d, 1)) {
    const x = days[d];
    if (!x) { run = 0; continue; }
    if (x.status === "open") continue;
    const r = dayResult(x);
    if (r === "ok") { run++; best = Math.max(best, run); }
    else if (r === "short") run = 0;
  }
  return best;
}

/* The only numbers buddies can see when sharing is on: the streak and last-7-day completion as a whole percent. */
export function shareData(days, today) {
  const c = completion(days, today, 7);
  return { streak: streak(days, today), pct7: c.pct === null ? null : Math.round(c.pct * 100) };
}
