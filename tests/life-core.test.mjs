import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../life-core.js";

const mk = (o = {}) => L.validateTask({ title: "Read", type: "count", target: 10, unit: "pages", recur: { kind: "daily" }, ...o }, { id: o.id || "t1", now: 1 });
const taskMap = (...ts) => Object.fromEntries(ts.map(t => [t.id, t]));

/* ---------- task schema validation ---------- */
test("valid tasks are accepted and tidied", () => {
  const r = mk({ title: "  Read   a  book ", why: "x".repeat(300) });
  assert.ok(r.ok);
  assert.equal(r.task.title, "Read a book");
  assert.equal(r.task.why.length, 140);
  assert.equal(r.task.slot, "anytime");
  assert.equal(r.task.source, "manual");
});
test("boolean tasks need no target or unit", () => {
  const r = mk({ type: "boolean", target: "", unit: "" });
  assert.ok(r.ok); assert.equal(r.task.target, 1); assert.equal(r.task.unit, "");
});
test("duration is always minutes", () => {
  const r = mk({ type: "duration", target: 20, unit: "hours" });
  assert.equal(r.task.unit, "min");
});
test("bad input is rejected with messages", () => {
  for (const bad of [{ title: "" }, { type: "nope" }, { target: 0 }, { target: -3 }, { target: "abc" }, { target: 99999 },
    { unit: "" }, { recur: null }, { recur: { kind: "days", days: [] } }, { recur: { kind: "days", days: [0, 8] } },
    { recur: { kind: "once", date: "tomorrow" } }]) {
    const r = mk(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.errors.length);
  }
  assert.equal(L.validateTask(null, { id: "x" }).ok, false);
});
test("unknown category, slot and difficulty fall back; source is limited", () => {
  const r = mk({ cat: "zzz", slot: "midnight", diff: 9, source: "evil" });
  assert.equal(r.task.cat, "other"); assert.equal(r.task.slot, "anytime"); assert.equal(r.task.diff, 1); assert.equal(r.task.source, "manual");
});
test("weekdays are de-duplicated and sorted", () => {
  const r = mk({ recur: { kind: "days", days: [5, 1, 5, "3"] } });
  assert.deepEqual(r.task.recur.days, [1, 3, 5]);
});
test("step sizes", () => {
  assert.equal(L.stepFor({ type: "duration", unit: "min" }), 5);
  assert.equal(L.stepFor({ type: "quantity", unit: "L" }), 0.5);
  assert.equal(L.stepFor({ type: "count", unit: "pages" }), 1);
});

/* ---------- recurrence ---------- */
test("recurrence", () => {
  const daily = mk().task, wk = mk({ id: "w", recur: { kind: "days", days: [1, 3] } }).task, once = mk({ id: "o", recur: { kind: "once", date: "2026-10-14" } }).task;
  assert.ok(L.occursOn(daily, "2026-10-14"));
  assert.ok(L.occursOn(wk, "2026-10-12"));   /* Monday */
  assert.ok(L.occursOn(wk, "2026-10-14"));   /* Wednesday */
  assert.ok(!L.occursOn(wk, "2026-10-13"));
  assert.ok(L.occursOn(once, "2026-10-14") && !L.occursOn(once, "2026-10-15"));
  assert.ok(!L.occursOn({ ...daily, active: false }, "2026-10-14"));
});
test("Monday-based weeks, including Sunday", () => {
  assert.equal(L.weekday("2026-10-18"), 7);
  assert.equal(L.mondayOf("2026-10-18"), "2026-10-12");
  assert.equal(L.mondayOf("2026-10-12"), "2026-10-12");
});

/* ---------- progress ---------- */
test("progress, tick, counters", () => {
  const day = L.buildDay(taskMap(mk().task, mk({ id: "b", type: "boolean" }).task), "2026-10-14");
  const [a, b] = day.tasks;
  assert.equal(L.dayPct(day), 0);
  L.bump(a, 1); assert.equal(a.value, 1); assert.equal(L.isDone(a), false);
  L.toggleDone(a); assert.equal(a.value, 10); assert.ok(L.isDone(a));
  L.toggleDone(a); assert.equal(a.value, 0);
  L.bump(a, -1); assert.equal(a.value, 0, "never below zero");
  L.toggleDone(b);
  assert.equal(L.dayPct(day), 0.5);
});
test("a day with no tasks has no percentage", () => {
  assert.equal(L.dayPct(L.buildDay({}, "2026-10-14")), null);
});
test("timer adds elapsed minutes and live value includes a running timer", () => {
  const inst = L.buildDay(taskMap(mk({ type: "duration", target: 20, unit: "min" }).task), "2026-10-14").tasks[0];
  L.startTimer(inst, 0);
  assert.equal(L.liveValue(inst, 90_000), 1.5);
  L.stopTimer(inst, 600_000);
  assert.equal(inst.value, 10); assert.equal(inst.run, undefined);
  L.stopTimer(inst, 900_000); assert.equal(inst.value, 10, "stopping twice adds nothing");
});

/* ---------- ending a day ---------- */
const sample = () => L.buildDay(taskMap(mk().task, mk({ id: "b", type: "boolean", title: "Walk" }).task), "2026-10-14");

test("End Day works with nothing done", () => {
  const d = L.endDay(sample(), { now: 100 });
  assert.equal(d.status, "ended"); assert.equal(d.endedAt, 100); assert.deepEqual(d.reasons, {});
});
test("reasons are optional and kept only for incomplete tasks with a known code", () => {
  const day = sample(); L.toggleDone(day.tasks[1]);
  const d = L.endDay(day, { now: 5, reasons: { t1: "no_time", b: "forgot", ghost: "no_time" } });
  assert.deepEqual(d.reasons, { t1: "no_time" });
  const d2 = L.endDay(sample(), { now: 5, reasons: { t1: "because I said so" } });
  assert.deepEqual(d2.reasons, {});
});
test("ending stops running timers and credits the time", () => {
  const day = L.buildDay(taskMap(mk({ type: "duration", target: 20, unit: "min" }).task), "2026-10-14");
  L.startTimer(day.tasks[0], 0);
  L.endDay(day, { now: 300_000 });
  assert.equal(day.tasks[0].value, 5); assert.equal(day.tasks[0].run, undefined);
});
test("an ended day is locked: ending again changes nothing", () => {
  const d = L.endDay(sample(), { now: 1 });
  L.endDay(d, { now: 2, reasons: { t1: "forgot" }, auto: true });
  assert.equal(d.status, "ended"); assert.equal(d.endedAt, 1);
});
test("undo works inside the window and not after", () => {
  const d = L.endDay(sample(), { now: 1000, reasons: { t1: "forgot" } });
  assert.ok(L.canUndo(d, 1000 + L.UNDO_MS));
  assert.ok(!L.canUndo(d, 1001 + L.UNDO_MS));
  L.undoEndDay(d, 1001 + L.UNDO_MS); assert.equal(d.status, "ended");
  L.undoEndDay(d, 2000);
  assert.equal(d.status, "open"); assert.deepEqual(d.reasons, {}); assert.equal(d.endedAt, undefined);
});
test("open days can't be undone", () => assert.ok(!L.canUndo(sample(), 0)));

/* ---------- auto-close ---------- */
test("stale open days close on their own, without reasons; today and closed days are untouched", () => {
  const old = sample(); old.date = "2026-10-12";
  const yest = sample(); yest.date = "2026-10-13"; L.endDay(yest, { now: 1, reasons: { t1: "forgot" } });
  const stale = sample(); stale.date = "2026-10-13";
  const now = sample(); now.date = "2026-10-14";
  const days = { a: old, b: yest, c: stale, d: now };
  const closed = L.autoCloseStale(days, "2026-10-14", 999);
  assert.deepEqual(closed.sort(), ["2026-10-12", "2026-10-13"]);
  assert.equal(old.status, "auto"); assert.deepEqual(old.reasons, {});
  assert.equal(yest.status, "ended"); assert.deepEqual(yest.reasons, { t1: "forgot" });
  assert.equal(now.status, "open");
});
test("auto-closed days can be reopened briefly like any other", () => {
  const d = sample(); L.endDay(d, { now: 10, auto: true });
  assert.ok(L.canUndo(d, 11));
});

/* ---------- rest day ---------- */
test("one rest day per week", () => {
  const days = {};
  const mkDay = date => { const d = L.buildDay(taskMap(mk().task), date); days[date] = d; return d; };
  assert.ok(L.canRest(days, "2026-10-14"));
  L.restDay(mkDay("2026-10-14"), 1);
  assert.ok(!L.canRest(days, "2026-10-16"), "same week");
  assert.ok(L.canRest(days, "2026-10-19"), "next week");
  assert.ok(!L.canRest({ "2026-10-14": days["2026-10-14"] }, "2026-10-14"), "already ended");
});

/* ---------- syncing task edits into an open day ---------- */
test("task edits flow into an open day, but not a closed one", () => {
  const t = mk().task;
  const day = L.buildDay({}, "2026-10-14");
  L.syncTaskIntoDay(day, t); assert.equal(day.tasks.length, 1);
  L.syncTaskIntoDay(day, { ...t, target: 5 }); assert.equal(day.tasks[0].snap.target, 5);
  L.syncTaskIntoDay(day, { ...t, active: false }); assert.equal(day.tasks.length, 0);
  L.syncTaskIntoDay(day, t); L.bump(day.tasks[0], 1);
  L.syncTaskIntoDay(day, { ...t, active: false }); assert.equal(day.tasks.length, 1, "progress is kept");
  L.endDay(day, { now: 1 });
  L.syncTaskIntoDay(day, { ...t, target: 99 }); assert.equal(day.tasks[0].snap.target, 10);
});

/* ---------- streak ---------- */
const fin = (date, doneAll, extra = {}) => {
  const d = L.buildDay(taskMap(mk().task), date);
  if (doneAll) L.toggleDone(d.tasks[0]);
  return Object.assign(L.endDay(d, { now: 1 }), extra);
};
test("streak counts good days and an open today doesn't break it", () => {
  const days = { "2026-10-12": fin("2026-10-12", true), "2026-10-13": fin("2026-10-13", true), "2026-10-14": L.buildDay(taskMap(mk().task), "2026-10-14") };
  assert.equal(L.streak(days, "2026-10-14"), 2);
  L.toggleDone(days["2026-10-14"].tasks[0]); L.endDay(days["2026-10-14"], { now: 2 });
  assert.equal(L.streak(days, "2026-10-14"), 3);
});
test("a short day ends the streak; an auto-closed short day too, without special treatment", () => {
  const bad = fin("2026-10-13", false);
  const days = { "2026-10-12": fin("2026-10-12", true), "2026-10-13": bad, "2026-10-14": fin("2026-10-14", true) };
  assert.equal(L.streak(days, "2026-10-14"), 1);
});
test("a rest day keeps the streak alive without adding to it", () => {
  const rest = L.restDay(L.buildDay(taskMap(mk().task), "2026-10-13"), 1);
  const days = { "2026-10-12": fin("2026-10-12", true), "2026-10-13": rest, "2026-10-14": fin("2026-10-14", true) };
  assert.equal(L.streak(days, "2026-10-14"), 2);
});
test("days with no tasks bridge the streak; a missing record ends it", () => {
  const empty = L.endDay(L.buildDay({}, "2026-10-13"), { now: 1 });
  const days = { "2026-10-12": fin("2026-10-12", true), "2026-10-13": empty, "2026-10-14": fin("2026-10-14", true) };
  assert.equal(L.streak(days, "2026-10-14"), 2);
  delete days["2026-10-13"];
  assert.equal(L.streak(days, "2026-10-14"), 1);
});
test("half done is enough to keep the streak", () => {
  const d = L.buildDay(taskMap(mk().task, mk({ id: "b", type: "boolean" }).task), "2026-10-14");
  L.toggleDone(d.tasks[1]); L.endDay(d, { now: 1 });
  assert.equal(L.dayResult(d), "ok");
});

/* ---------- history for the AI ---------- */
test("history: rates, reasons, latest target; open, rest and today are left out", () => {
  const t = mk().task;
  const mkDay = (date, done, reason) => {
    const d = L.buildDay(taskMap(t), date);
    if (done) L.toggleDone(d.tasks[0]);
    return L.endDay(d, { now: 1, reasons: reason ? { t1: reason } : {} });
  };
  const days = {
    "2026-10-10": mkDay("2026-10-10", true), "2026-10-11": mkDay("2026-10-11", false, "no_time"),
    "2026-10-12": mkDay("2026-10-12", false, "no_time"), "2026-10-13": mkDay("2026-10-13", false),
    "2026-10-14": L.buildDay(taskMap(t), "2026-10-14"),                  /* today, open */
    "2026-10-09": L.restDay(L.buildDay(taskMap(t), "2026-10-09"), 1),   /* rest */
    "2026-09-01": mkDay("2026-09-01", true),                             /* too old */
  };
  const h = L.historyFor(days, "2026-10-14");
  assert.equal(h.length, 1);
  assert.deepEqual(h[0], { title: "Read", type: "count", target: 10, unit: "pages", days: 4, reasons: { no_time: 2 }, rate: 0.25 });
  assert.deepEqual(L.historyFor({}, "2026-10-14"), []);
});

/* ---------- summaries ---------- */
test("summary ids and regenerate limit", () => {
  assert.equal(L.sumId("combined", "2026-10-14"), "sum_combined_2026-10-14");
  assert.ok(L.canRegen({})); assert.ok(L.canRegen({ regen: 1 })); assert.ok(!L.canRegen({ regen: 2 }));
});
test("day payload carries reasons only for undone tasks", () => {
  const d = L.buildDay(taskMap(mk().task, mk({ id: "b", type: "boolean", title: "Walk" }).task), "2026-10-14");
  L.toggleDone(d.tasks[1]);
  L.endDay(d, { now: 1, reasons: { t1: "no_time", b: "forgot" } });
  const p = L.dayPayload(d);
  assert.equal(p.pct, 0.5); assert.equal(p.status, "ended");
  assert.deepEqual(p.tasks.map(t => [t.title, t.done, t.reason]), [["Read", false, "no_time"], ["Walk", true, undefined]]);
});
test("trend: 14 rows, null for open, rest and missing days, sleep share, workout numbers", () => {
  const sleep = mk({ id: "s", title: "Lights out", type: "boolean", cat: "sleep" }).task;
  const closed = (date, doneSleep) => { const d = L.buildDay(taskMap(sleep, mk().task), date); if (doneSleep) L.toggleDone(d.tasks.find(i => i.id === "s")); return L.endDay(d, { now: 1 }); };
  const days = { "2026-10-12": closed("2026-10-12", true), "2026-10-13": L.restDay(L.buildDay(taskMap(sleep), "2026-10-13"), 1), "2026-10-14": L.buildDay(taskMap(sleep), "2026-10-14") };
  const t = L.trendFor(days, { "2026-10-12": { vol: 4000.4, sets: 12 } }, "2026-10-14");
  assert.equal(t.length, 14);
  assert.deepEqual(t[11], { d: "2026-10-12", pct: 0.5, sleep: 1, vol: 4000, sets: 12 });
  assert.deepEqual(t[12], { d: "2026-10-13", pct: null, sleep: null, vol: 0, sets: 0 });
  assert.deepEqual(t[13], { d: "2026-10-14", pct: null, sleep: null, vol: 0, sets: 0 });
  assert.equal(t[0].pct, null);
});
test("adjustments toggle on and off, capped at three, newest kept", () => {
  let l = [];
  l = L.toggleAdjustment(l, "  Read   first "); assert.deepEqual(l, ["Read first"]);
  l = L.toggleAdjustment(l, "Read first"); assert.deepEqual(l, []);
  for (const x of ["a", "b", "c", "d"]) l = L.toggleAdjustment(l, x);
  assert.deepEqual(l, ["b", "c", "d"]);
});

/* ---------- dashboard ---------- */
const mkClosed = (date, spec, reasons = {}) => {
  const ts = Object.fromEntries(Object.keys(spec).map(id => [id, mk({ id, title: id, slot: id === "m" ? "morning" : "evening", type: "boolean" }).task]));
  const d = L.buildDay(ts, date);
  d.tasks.forEach(i => { if (spec[i.id]) L.toggleDone(i); });
  return L.endDay(d, { now: 1, reasons });
};
test("completion over a window ignores open, rest and empty days", () => {
  const days = { "2026-10-12": mkClosed("2026-10-12", { m: true, e: false }), "2026-10-13": mkClosed("2026-10-13", { m: true, e: true }),
    "2026-10-14": L.buildDay(taskMap(mk().task), "2026-10-14"), "2026-10-11": L.restDay(L.buildDay(taskMap(mk().task), "2026-10-11"), 1) };
  assert.deepEqual(L.completion(days, "2026-10-14", 7), { pct: 0.75, days: 2, tasks: 4, done: 3 });
  assert.equal(L.completion(days, "2026-10-14", 1).pct, null);
  assert.equal(L.completion({}, "2026-10-14", 7).pct, null);
});
test("most skipped needs enough data, and names the usual reason", () => {
  const days = {};
  for (let k = 0; k < 4; k++) { const dt = L.addDays("2026-10-10", k); days[dt] = mkClosed(dt, { m: true, e: false }, { e: k < 3 ? "no_time" : "forgot" }); }
  assert.deepEqual(L.mostSkipped(days, "2026-10-14"), { title: "e", missed: 4, days: 4, reason: "no_time" });
  assert.equal(L.mostSkipped({ "2026-10-13": days["2026-10-13"] }, "2026-10-14"), null);
});
test("best time of day needs two slots with enough tasks", () => {
  const days = {};
  for (let k = 0; k < 5; k++) { const dt = L.addDays("2026-10-08", k); days[dt] = mkClosed(dt, { m: true, e: k === 0 }); }
  assert.deepEqual(L.bestSlot(days, "2026-10-14"), { slot: "morning", pct: 1 });
  const one = {}; for (let k = 0; k < 5; k++) { const dt = L.addDays("2026-10-08", k); one[dt] = mkClosed(dt, { m: true }); }
  assert.equal(L.bestSlot(one, "2026-10-14"), null);
  assert.equal(L.bestSlot(days, "2026-10-14", 2), null, "window too small");
});
test("longest streak", () => {
  const days = { "2026-10-01": mkClosed("2026-10-01", { m: true }), "2026-10-02": mkClosed("2026-10-02", { m: true }), "2026-10-03": mkClosed("2026-10-03", { m: false }),
    "2026-10-04": mkClosed("2026-10-04", { m: true }), "2026-10-05": mkClosed("2026-10-05", { m: true }), "2026-10-06": mkClosed("2026-10-06", { m: true }),
    "2026-10-08": mkClosed("2026-10-08", { m: true }) };
  assert.equal(L.longestStreak(days), 3, "the gap on the 7th breaks the run");
  assert.equal(L.longestStreak({}), 0);
});
test("share data holds only the streak and a whole percent", () => {
  const days = { "2026-10-13": mkClosed("2026-10-13", { m: true, e: false }, { e: "forgot" }), "2026-10-14": mkClosed("2026-10-14", { m: true, e: true }) };
  const s = L.shareData(days, "2026-10-14");
  assert.deepEqual(s, { streak: 2, pct7: 75 });
  assert.deepEqual(Object.keys(s).sort(), ["pct7", "streak"]);
  assert.deepEqual(L.shareData({}, "2026-10-14"), { streak: 0, pct7: null });
});
