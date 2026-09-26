/**
 * Tests for the per-day timetable (course_slots) feature and the v1->v2 data migration.
 * Every expectation is derived from the ORIGINAL updated route source, not from my own port.
 */
import { Store, memoryPersistence, migrate, DB_VERSION, emptyDB, type DB } from "../src/db/store";
import { handle } from "../src/db/router";
import { ensureSeeded } from "../src/db/seed";
import { makeBackup, restoreBackup } from "../src/db/backup";
import { dowKey, todayKey } from "../src/lib/utils";

let pass = 0, fail = 0;
const t = (n: string, ok: boolean, x = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${!ok && x ? "  -> " + x : ""}`); };
const call = (s: Store, m: string, u: string, b: any = null) => handle(s, m, u, b);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const mk = async (seed = false) => { const p = memoryPersistence(); const s = new Store(p); if (seed) await ensureSeeded(s); return { s, p }; };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  console.log("\n== POST /courses with slots ==");
  {
    const { s } = await mk();
    const r: any = (await call(s, "POST", "/api/courses", {
      name: "Pharmacology",
      slots: [
        { dayOfWeek: "wed", startTime: "10:00", endTime: "10:50" },
        { dayOfWeek: "mon", startTime: "09:00", endTime: "09:55" },
        { dayOfWeek: "mon", startTime: "14:00", endTime: "14:45" },
      ],
    })).body;
    t("returns 201-style body with slots array", Array.isArray(r.slots) && r.slots.length === 3);
    t("legacy daysOfWeek DERIVED from slots, deduped, in slot order", eq(r.daysOfWeek, ["wed", "mon"]), JSON.stringify(r.daysOfWeek));
    t("legacy startTime = earliest non-empty slot start", r.startTime === "09:00", r.startTime);
    t("sortOrder = insertion index", eq(r.slots.map((x: any) => x.sortOrder), [0, 1, 2]));
    t("two slots on the same day are both kept", r.slots.filter((x: any) => x.dayOfWeek === "mon").length === 2);
    t("slot ids are unique + ascending", eq(r.slots.map((x: any) => x.id), [1, 2, 3]));
    t("slot label defaults to empty string", r.slots.every((x: any) => x.label === ""));
  }

  console.log("\n== cleanSlots(): junk is dropped, not fatal ==");
  {
    const { s } = await mk();
    const r: any = (await call(s, "POST", "/api/courses", {
      name: "X",
      slots: [
        { dayOfWeek: "funday", startTime: "09:00" },   // bad weekday
        { dayOfWeek: 5 },                              // non-string
        null,                                          // null entry
        "mon",                                         // not an object
        { dayOfWeek: "tue", startTime: 900, endTime: null }, // coerced to strings
      ],
    })).body;
    t("only the one valid slot survives", r.slots.length === 1 && r.slots[0].dayOfWeek === "tue");
    t("numeric startTime coerced to string", r.slots[0].startTime === "900");
    t("null endTime -> empty string", r.slots[0].endTime === "");
    const r2: any = (await call(s, "POST", "/api/courses", { name: "Y", slots: "not-an-array" })).body;
    t("non-array slots -> no slots, no crash", r2.slots.length === 0);
    t("slots without any time still valid (time varies)", ((await call(s, "POST", "/api/courses", { name: "Z", slots: [{ dayOfWeek: "fri" }] })).body as any).slots.length === 1);
  }

  console.log("\n== legacy payload still works (daysOfWeek + startTime, no slots) ==");
  {
    const { s } = await mk();
    const r: any = (await call(s, "POST", "/api/courses", { name: "Legacy", daysOfWeek: ["tue", "thu"], startTime: "11:00", endTime: "11:50" })).body;
    t("uniform slots synthesised, one per legacy day", r.slots.length === 2 && eq(r.slots.map((x: any) => x.dayOfWeek), ["tue", "thu"]));
    t("synthesised slots carry the shared start/end", r.slots.every((x: any) => x.startTime === "11:00" && x.endTime === "11:50"));
    t("course.startTime kept from legacy field", r.startTime === "11:00");
    const bare: any = (await call(s, "POST", "/api/courses", { name: "NoDays" })).body;
    t("no days and no slots -> empty timetable", bare.slots.length === 0 && eq(bare.daysOfWeek, []));
  }

  console.log("\n== PATCH /courses/:id ==");
  {
    const { s } = await mk();
    const c: any = (await call(s, "POST", "/api/courses", { name: "P", slots: [{ dayOfWeek: "mon", startTime: "09:00", endTime: "10:00" }, { dayOfWeek: "tue", startTime: "09:00", endTime: "10:00" }] })).body;
    // 1) patch WITHOUT slots must not touch the timetable
    const p1: any = (await call(s, "PATCH", `/api/courses/${c.id}`, { location: "Room 9" })).body;
    t("PATCH without slots leaves slots untouched", p1.slots.length === 2 && p1.location === "Room 9");
    t("PATCH without slots leaves derived days untouched", eq(p1.daysOfWeek, ["mon", "tue"]));
    // 2) patch WITH slots replaces ALL of them
    const p2: any = (await call(s, "PATCH", `/api/courses/${c.id}`, { slots: [{ dayOfWeek: "fri", startTime: "15:00", endTime: "16:00" }] })).body;
    t("PATCH with slots REPLACES the timetable", p2.slots.length === 1 && p2.slots[0].dayOfWeek === "fri");
    t("PATCH re-derives daysOfWeek from new slots", eq(p2.daysOfWeek, ["fri"]));
    t("PATCH re-derives startTime from new slots", p2.startTime === "15:00");
    t("old slot rows are really gone from the store (no leak)", s.db.slots.filter((x) => x.courseId === c.id).length === 1);
    t("re-inserted slots get NEW ids (never reuse)", p2.slots[0].id > 2, `id ${p2.slots[0].id}`);
    // 3) empty slots array clears the timetable
    const p3: any = (await call(s, "PATCH", `/api/courses/${c.id}`, { slots: [] })).body;
    t("PATCH slots:[] clears the timetable", p3.slots.length === 0 && eq(p3.daysOfWeek, []) && p3.startTime === "");
    // 4) non-array slots ignored
    await call(s, "PATCH", `/api/courses/${c.id}`, { slots: [{ dayOfWeek: "sat", startTime: "08:00" }] });
    const p4: any = (await call(s, "PATCH", `/api/courses/${c.id}`, { slots: "junk" })).body;
    t("PATCH with non-array slots is ignored (timetable kept)", p4.slots.length === 1);
    // 5) original PATCH no longer applies daysOfWeek/startTime directly
    const before = clone(p4);
    const p5: any = (await call(s, "PATCH", `/api/courses/${c.id}`, { daysOfWeek: ["sun"], startTime: "23:59" })).body;
    t("PATCH ignores direct daysOfWeek (source no longer accepts it)", eq(p5.daysOfWeek, before.daysOfWeek));
    t("PATCH ignores direct startTime", p5.startTime === before.startTime);
    // 6) new PATCH accepts `code`
    const p6: any = (await call(s, "PATCH", `/api/courses/${c.id}`, { code: "PH201" })).body;
    t("PATCH now accepts code", p6.code === "PH201");
    t("PATCH unknown id -> 404", (await call(s, "PATCH", "/api/courses/999", { slots: [] })).status === 404);
  }

  console.log("\n== GET /courses attaches slots, ordered ==");
  {
    const { s } = await mk();
    await call(s, "POST", "/api/courses", { name: "B", slots: [{ dayOfWeek: "mon", startTime: "10:00" }] });
    await call(s, "POST", "/api/courses", { name: "A", slots: [{ dayOfWeek: "tue", startTime: "09:00" }, { dayOfWeek: "wed", startTime: "08:00" }] });
    const list: any[] = (await call(s, "GET", "/api/courses")).body as any[];
    t("still sorted by name", eq(list.map((c) => c.name), ["A", "B"]));
    t("every course carries its own slots", list[0].slots.length === 2 && list[1].slots.length === 1);
    t("slots never leak across courses", list.every((c) => c.slots.every((x: any) => x.courseId === c.id)));
    t("empty course still has slots: []", ((await call(s, "POST", "/api/courses", { name: "C" })).body as any).slots.length === 0);
  }

  console.log("\n== DELETE cascades slots ==");
  {
    const { s } = await mk();
    const a: any = (await call(s, "POST", "/api/courses", { name: "A", slots: [{ dayOfWeek: "mon" }, { dayOfWeek: "tue" }] })).body;
    const b: any = (await call(s, "POST", "/api/courses", { name: "B", slots: [{ dayOfWeek: "wed" }] })).body;
    await call(s, "DELETE", `/api/courses/${a.id}`);
    t("deleted course's slots are removed", s.db.slots.every((x) => x.courseId !== a.id));
    t("other course's slots untouched", s.db.slots.filter((x) => x.courseId === b.id).length === 1);
  }

  console.log("\n== summary: todaySlots / meetsToday / ordering ==");
  {
    const { s } = await mk();
    const dow = dowKey(); const other = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].find((d) => d !== dow)!;
    const late: any = (await call(s, "POST", "/api/courses", { name: "Late", slots: [{ dayOfWeek: dow, startTime: "15:00", endTime: "16:00" }] })).body;
    const early: any = (await call(s, "POST", "/api/courses", { name: "Early", slots: [{ dayOfWeek: dow, startTime: "14:00", endTime: "14:30" }, { dayOfWeek: dow, startTime: "08:00", endTime: "08:45" }] })).body;
    const notToday: any = (await call(s, "POST", "/api/courses", { name: "Other", slots: [{ dayOfWeek: other, startTime: "09:00" }] })).body;
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    const cs = (n: string) => sm.courses.find((c: any) => c.name === n);
    t("course with today's slot meetsToday", cs("Late").meetsToday && cs("Early").meetsToday);
    t("course with only other-day slots does NOT meet today", !cs("Other").meetsToday);
    t("todaySlots only contains today's day", cs("Early").todaySlots.every((x: any) => x.dayOfWeek === dow));
    t("todaySlots sorted by start time", eq(cs("Early").todaySlots.map((x: any) => x.startTime), ["08:00", "14:00"]));
    t("full weekly slots still exposed on the course", cs("Other").slots.length === 1);
    t("todayLectures excludes non-meeting courses", sm.todayLectures.every((c: any) => c.name !== "Other"));
    t("todayLectures ordered by FIRST slot today (Early 08:00 < Late 15:00)", eq(sm.todayLectures.map((c: any) => c.name), ["Early", "Late"]), JSON.stringify(sm.todayLectures.map((c: any) => c.name)));
  }

  console.log("\n== todayLectures order must follow TODAY'S slot, not the course's overall earliest start ==");
  {
    const { s } = await mk();
    const dow = dowKey(); const other = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].find((d) => d !== dow)!;
    // "Alpha": earliest slot of the WEEK is 07:00 on another day, but today it meets at 16:00.
    // "Beta":  only meets today, at 09:00.
    // Legacy course.startTime -> Alpha "07:00" < Beta "09:00" (WRONG order).
    // Today's slot            -> Beta "09:00" < Alpha "16:00" (RIGHT order).
    const alpha: any = (await call(s, "POST", "/api/courses", { name: "Alpha", slots: [{ dayOfWeek: other, startTime: "07:00" }, { dayOfWeek: dow, startTime: "16:00" }] })).body;
    await call(s, "POST", "/api/courses", { name: "Beta", slots: [{ dayOfWeek: dow, startTime: "09:00" }] });
    t("precondition: Alpha's course.startTime is its weekly earliest (07:00)", alpha.startTime === "07:00");
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    t("Beta (today 09:00) is listed BEFORE Alpha (today 16:00)", eq(sm.todayLectures.map((c: any) => c.name), ["Beta", "Alpha"]), JSON.stringify(sm.todayLectures.map((c: any) => c.name)));
  }

  console.log("\n== summary: legacy fallback (days set, no slot rows) ==");
  {
    const { s } = await mk();
    const dow = dowKey();
    // Simulate a course that exists with days but has no slot rows.
    await s.transact((db) => {
      db.courses.push({ id: ++db.seq.courses, name: "OldStyle", code: "", color: "#6C5CE7", instructor: "", location: "", daysOfWeek: [dow], startTime: "12:00", endTime: "12:50", targetPercent: 75, startDate: "", createdAt: new Date().toISOString() });
    });
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    const c = sm.courses[0];
    t("legacy course still meets today via fallback", c.meetsToday === true);
    t("fallback slot has negative synthetic id (-courseId)", c.todaySlots.length === 1 && c.todaySlots[0].id === -c.id);
    t("fallback slot uses course start/end", c.todaySlots[0].startTime === "12:00" && c.todaySlots[0].endTime === "12:50");
    t("fallback is NOT written into the slots table", s.db.slots.length === 0);
  }

  console.log("\n== summary: holidays still suppress meetsToday ==");
  {
    const { s } = await mk();
    await call(s, "POST", "/api/courses", { name: "H", slots: [{ dayOfWeek: dowKey(), startTime: "09:00" }] });
    await call(s, "POST", "/api/holidays", { title: "Off", startDate: todayKey() });
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    t("holiday today -> meetsToday false even with a matching slot", sm.courses[0].meetsToday === false && sm.todayLectures.length === 0);
  }

  console.log("\n== seeded timetable (new per-day times) ==");
  {
    const { s } = await mk(true);
    const list: any[] = (await call(s, "GET", "/api/courses")).body as any[];
    const maths = list.find((c) => c.name === "Engineering Mathematics");
    t("5 seeded courses", list.length === 5);
    t("Maths has 3 DIFFERENT per-day times (Mon 09:00 / Wed 08:00 / Sat 09:00)", eq(maths.slots.map((x: any) => `${x.dayOfWeek}@${x.startTime}`), ["mon@09:00", "wed@08:00", "sat@09:00"]));
    t("seeded course endTime is empty (times live on slots)", list.every((c) => c.endTime === ""));
    t("lab slot carries the 'Lab' label", list.find((c) => c.name === "DBMS Lab").slots[0].label === "Lab");
    t("Operating Systems has two different Thursday/Mon times", list.find((c) => c.name === "Operating Systems").slots.length === 3);
    t("legacy days derived from slots on seed", eq(maths.daysOfWeek, ["mon", "wed", "sat"]));
  }

  console.log("\n== v1 -> v2 MIGRATION (data already on a phone must survive) ==");
  {
    // A genuine v1 snapshot: no `slots` table, no seq.slots, version 1.
    const v1: any = {
      seq: { courses: 2, attendance: 1, tasks: 1, exams: 0, holidays: 0, syllabus: 0, logs: 2 },
      courses: [
        { id: 1, name: "Pharmacology", code: "PH", color: "#6C5CE7", instructor: "Dr X", location: "LH1", daysOfWeek: ["mon", "wed"], startTime: "09:00", endTime: "09:55", targetPercent: 75, createdAt: "2026-01-01T00:00:00.000Z" },
        { id: 2, name: "Pathology", code: "", color: "#22C55E", instructor: "", location: "", daysOfWeek: [], startTime: "", endTime: "", targetPercent: 80, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      attendance: [{ id: 1, courseId: 1, date: "2026-01-05", status: "present", note: "", createdAt: "2026-01-05T00:00:00.000Z" }],
      tasks: [{ id: 1, title: "Record", type: "assignment", courseId: 1, dueDate: "2026-02-01", dueTime: "", priority: "medium", status: "pending", notes: "", remindDaysBefore: 1, createdAt: "2026-01-01T00:00:00.000Z", completedAt: null }],
      exams: [], holidays: [], syllabus: [],
      logs: [{ id: 1, action: "create", entity: "course", detail: "x", createdAt: "2026-01-01T00:00:00.000Z" }],
      meta: { version: 1, seeded: true },
    };
    const m = migrate(clone(v1)) as DB;
    t("migrate() returns a DB", !!m);
    t("version bumped to current", m.meta.version === DB_VERSION);
    t("seeded flag preserved (demo data must not return)", m.meta.seeded === true);
    // v3 additionally backfills `startDate` (courses) and `session` (attendance)
    // onto pre-existing rows — so "preserved" now means "identical apart from
    // those two additive, safe-default fields", not byte-for-byte anymore.
    t(
      "courses preserved (plus startDate backfilled to '')",
      eq(
        m.courses.map(({ startDate, ...rest }) => rest),
        v1.courses
      ) && m.courses.every((c) => c.startDate === "")
    );
    t(
      "attendance preserved (plus session backfilled to 1)",
      eq(
        m.attendance.map(({ session, ...rest }) => rest),
        v1.attendance
      ) && m.attendance.every((a) => a.session === 1)
    );
    t("tasks preserved exactly", eq(m.tasks, v1.tasks));
    t("one slot synthesised per legacy day (mon, wed)", m.slots.length === 2 && eq(m.slots.map((x) => x.dayOfWeek), ["mon", "wed"]));
    t("synthesised slots carry the course's start/end", m.slots.every((x) => x.startTime === "09:00" && x.endTime === "09:55"));
    t("course with no days gets no slots", m.slots.every((x) => x.courseId === 1));
    t("seq.slots continues past synthesised ids", m.seq.slots === 2);
    t("original seqs preserved (no id reuse)", m.seq.courses === 2 && m.seq.attendance === 1 && m.seq.logs === 2);

    // full end-to-end: a store loading a v1 snapshot from disk
    const p = memoryPersistence(); p.snapshot = clone(v1);
    const s = new Store(p); await s.whenReady();
    t("Store loads v1 snapshot instead of discarding it", s.db.courses.length === 2);
    t("upgrade is persisted to storage immediately", (p.snapshot as any).meta.version === DB_VERSION && (p.snapshot as any).slots.length === 2);
    const list: any[] = (await call(s, "GET", "/api/courses")).body as any[];
    t("migrated course exposes its slots via the API", list.find((c) => c.name === "Pharmacology").slots.length === 2);
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    t("summary works on migrated data", sm.courses.length === 2);
    const nc: any = (await call(s, "POST", "/api/courses", { name: "New" })).body;
    t("new course after migration gets id 3 (no collision)", nc.id === 3);
    // running migrate on an already-current snapshot is a no-op
    const again = migrate(clone(m)) as DB;
    t("migrate() is idempotent on current data", eq(again.slots, m.slots) && again.meta.version === DB_VERSION);
    t("re-migrating does not duplicate slots", again.slots.length === 2);
  }

  console.log("\n== migrate() refuses unusable snapshots ==");
  {
    t("null -> null", migrate(null) === null);
    t("string -> null", migrate("x") === null);
    t("no meta -> null", migrate({ courses: [] }) === null);
    t("newer version -> null (never corrupt a future format)", migrate({ meta: { version: DB_VERSION + 5 } }) === null);
    t("non-numeric version -> null", migrate({ meta: { version: "2" } }) === null);
    const damaged: any = { meta: { version: 1, seeded: true }, courses: "oops", seq: null };
    const m = migrate(damaged) as DB;
    t("non-array tables are coerced to [] instead of crashing", m && Array.isArray(m.courses) && Array.isArray(m.slots));
    const p = memoryPersistence(); p.snapshot = { meta: { version: 999 } } as any;
    const s = new Store(p); await s.whenReady();
    t("Store with future-version snapshot starts empty, doesn't crash", s.db.courses.length === 0);
  }

  console.log("\n== backup includes slots & round-trips ==");
  {
    const { s } = await mk(true);
    const file: any = makeBackup(s.db);
    t("backup schema is 2", file.schema === 2);
    t("backup has slots table + count", Array.isArray(file.data.slots) && file.counts.slots === s.db.slots.length && file.counts.slots > 0);
    const b = await mk(false);
    const r: any = await restoreBackup(b.s, JSON.stringify(file));
    t("restore ok", r.ok === true, JSON.stringify(r));
    t("slots identical after restore", eq(b.s.db.slots, s.db.slots));
    t("slot seq counter >= max slot id", b.s.db.seq.slots >= Math.max(...s.db.slots.map((x) => x.id)));
    const nc: any = (await call(b.s, "POST", "/api/courses", { name: "N", slots: [{ dayOfWeek: "mon" }] })).body;
    t("new slot after restore doesn't collide with restored ids", !s.db.slots.some((x) => x.id === nc.slots[0].id), `id ${nc.slots[0].id}`);
  }

  console.log("\n== OLD (schema 1) backup files still restore ==");
  {
    const { s } = await mk(true);
    const old: any = clone(makeBackup(s.db)); old.schema = 1; delete old.data.slots; delete old.counts.slots;
    const b = await mk(false);
    const r: any = await restoreBackup(b.s, JSON.stringify(old));
    t("v1 backup (no slots table) is accepted", r.ok === true, JSON.stringify(r));
    t("timetable is rebuilt from the course's days", b.s.db.slots.length > 0);
    t("user is told the timetable was upgraded", Array.isArray(r.repaired) && r.repaired.some((x: string) => x.includes("timetable")));
    t("every restored course still meets on its days", b.s.db.courses.every((c) => c.daysOfWeek.every((d) => b.s.db.slots.some((x) => x.courseId === c.id && x.dayOfWeek === d))));
  }

  console.log("\n== corrupt slots in a v2 backup are rejected ==");
  {
    const { s } = await mk(true);
    const good: any = makeBackup(s.db);
    const tamper = (fn: (b: any) => void) => { const b = clone(good); fn(b); return JSON.stringify(b); };
    const cases: [string, string][] = [
      ["slot orphaned (course missing)", tamper((b) => { b.data.slots[0].courseId = 9999; })],
      ["slot with invalid weekday", tamper((b) => { b.data.slots[0].dayOfWeek = "funday"; })],
      ["slot with duplicate id", tamper((b) => { b.data.slots[1].id = b.data.slots[0].id; })],
      ["slot with id 0", tamper((b) => { b.data.slots[0].id = 0; })],
      ["v2 backup missing slots table", tamper((b) => { delete b.data.slots; })],
      ["slots is not an array", tamper((b) => { b.data.slots = {}; })],
    ];
    for (const [name, raw] of cases) {
      const before = JSON.stringify(s.db);
      const r: any = await restoreBackup(s, raw);
      t(`rejects: ${name}`, r.ok === false, JSON.stringify(r).slice(0, 90));
      if (JSON.stringify(s.db) !== before) t(`  (live data changed by rejected '${name}'!)`, false);
    }
  }

  console.log("\n== multi-lecture days: a course meeting twice in one day ==");
  {
    const { s } = await mk();
    const c: any = (await call(s, "POST", "/api/courses", {
      name: "Lab", slots: [{ dayOfWeek: dowKey(), startTime: "09:00" }],
    })).body;
    const day = todayKey();
    const r1: any = (await call(s, "POST", "/api/attendance", { courseId: c.id, date: day, status: "present", session: 1 })).body;
    const r2: any = (await call(s, "POST", "/api/attendance", { courseId: c.id, date: day, status: "absent", session: 2 })).body;
    t("session 1 and session 2 are separate rows", r1.id !== r2.id);
    t("session 1 kept its own status (present)", r1.status === "present");
    t("session 2 kept its own status (absent)", r2.status === "absent");
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    const course = sm.courses.find((x: any) => x.id === c.id);
    t("todayMarks has both lectures", course.todayMarks.length === 2);
    t("present + absent counted separately in totals", course.present === 1 && course.absent === 1);
    // Re-posting the same session upserts (edits) rather than adding a 3rd row.
    const r1b: any = (await call(s, "POST", "/api/attendance", { courseId: c.id, date: day, status: "absent", session: 1 })).body;
    t("re-posting the same session updates it in place, same id", r1b.id === r1.id && r1b.status === "absent");
    const smAfter: any = (await call(s, "GET", "/api/summary")).body;
    t("still exactly 2 marks that day, not 3", smAfter.courses.find((x: any) => x.id === c.id).todayMarks.length === 2);
    // Omitting `session` defaults to 1 — old callers keep working unchanged.
    const r3: any = (await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-01-05", status: "present" })).body;
    t("omitted session defaults to 1", r3.session === 1);
  }

  console.log("\n== exam window: attendance from course start to its nearest exam ==");
  {
    const { s } = await mk();
    // Meets every Monday. Start it 3 Mondays before an exam 1 day after the 3rd Monday.
    const c: any = (await call(s, "POST", "/api/courses", {
      name: "Physics", targetPercent: 75, startDate: "2026-01-05", // a Monday
      slots: [{ dayOfWeek: "mon", startTime: "09:00" }],
    })).body;
    await call(s, "POST", "/api/exams", { subject: "Physics Midterm", courseId: c.id, date: "2026-01-27" }); // after 3 Mondays: 5, 12, 19, 26 -> 4 Mondays actually
    await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-01-05", status: "present" });
    await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-01-12", status: "absent" });
    await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-01-19", status: "present" });
    // 2026-01-26 (the 4th scheduled Monday) intentionally left unmarked.
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    const w = sm.courses.find((x: any) => x.id === c.id).examWindow;
    t("examWindow found the linked exam", w && w.examSubject === "Physics Midterm");
    t("scheduled counts every Monday in [start, exam] = 4", w.scheduled === 4);
    t("present/absent match what was actually marked", w.present === 2 && w.absent === 1);
    t("percentage is present/(present+absent), cancelled excluded", w.percentage === 66.7);

    // A holiday on a scheduled Monday should reduce the scheduled count.
    await call(s, "POST", "/api/holidays", { title: "Off", startDate: "2026-01-19", endDate: "2026-01-19" });
    const sm2: any = (await call(s, "GET", "/api/summary")).body;
    const w2 = sm2.courses.find((x: any) => x.id === c.id).examWindow;
    t("holiday on a scheduled day drops it from 'scheduled'", w2.scheduled === 3);

    // No exam for the course at all -> no exam window, not a crash.
    const { s: s2 } = await mk();
    const c2: any = (await call(s2, "POST", "/api/courses", { name: "NoExam", startDate: "2026-01-01" })).body;
    const sm3: any = (await call(s2, "GET", "/api/summary")).body;
    t("no linked exam -> examWindow is null", sm3.courses.find((x: any) => x.id === c2.id).examWindow === null);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
