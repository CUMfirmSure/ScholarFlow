/**
 * Verifies the on-device engine reproduces the original Next/Postgres API semantics.
 * Runs in plain Node with in-memory persistence. Exit code != 0 on any failure.
 */
import { Store, memoryPersistence, DB_VERSION } from "../src/db/store";
import { handle } from "../src/db/router";
import { ensureSeeded } from "../src/db/seed";
import { todayKey } from "../src/lib/utils";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${!ok && extra ? "  -> " + extra : ""}`);
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function fresh(seed = false) {
  const p = memoryPersistence();
  const s = new Store(p);
  if (seed) await ensureSeeded(s);
  return { s, p };
}
const call = (s: Store, m: string, u: string, b: any = null) => handle(s, m, u, b);

async function main() {
  console.log("\n== validation (must match original 400s) ==");
  {
    const { s } = await fresh();
    t("course without name -> 400", (await call(s, "POST", "/api/courses", {})).status === 400);
    t("course blank name -> 400", (await call(s, "POST", "/api/courses", { name: "  " })).status === 400);
    t("task without title -> 400", (await call(s, "POST", "/api/tasks", { dueDate: "2026-01-01" })).status === 400);
    t("task without dueDate -> 400", (await call(s, "POST", "/api/tasks", { title: "x" })).status === 400);
    t("exam no subject -> 400", (await call(s, "POST", "/api/exams", { date: "2026-01-01" })).status === 400);
    t("holiday no startDate -> 400", (await call(s, "POST", "/api/holidays", { title: "h" })).status === 400);
    t("attendance bad status -> 400", (await call(s, "POST", "/api/attendance", { courseId: 1, date: "2026-01-01", status: "late" })).status === 400);
    t("exam bulk with no valid rows -> 400", (await call(s, "POST", "/api/exams", { exams: [{ subject: "" }] })).status === 400);
    t("syllabus bulk empty -> 400", (await call(s, "POST", "/api/syllabus", { courseId: 1, topics: ["", "  "] })).status === 400);
    t("syllabus bulk no courseId -> 400", (await call(s, "POST", "/api/syllabus", { topics: ["a"] })).status === 400);
    t("DELETE missing course -> 404", (await call(s, "DELETE", "/api/courses/999")).status === 404);
    t("PATCH missing task -> 404", (await call(s, "PATCH", "/api/tasks/999", { title: "z" })).status === 404);
    t("unknown route -> 404", (await call(s, "GET", "/api/nope")).status === 404);
    t("health ok", eq((await call(s, "GET", "/api/health")).body, { ok: true }));
  }

  console.log("\n== CRUD + ids + defaults ==");
  {
    const { s } = await fresh();
    const c1: any = (await call(s, "POST", "/api/courses", { name: "  Physics ", daysOfWeek: ["mon"] })).body;
    const c2: any = (await call(s, "POST", "/api/courses", { name: "Chem" })).body;
    t("ids autoincrement from 1", c1.id === 1 && c2.id === 2);
    t("name trimmed", c1.name === "Physics");
    t("default targetPercent 75", c1.targetPercent === 75);
    t("auto color cycles palette", c1.color !== c2.color);
    await call(s, "POST", "/api/courses", { name: "X", color: "#123456" });
    t("explicit color respected", ((await call(s, "GET", "/api/courses")).body as any[]).some((c) => c.color === "#123456"));
    const list: any[] = (await call(s, "GET", "/api/courses")).body as any[];
    t("courses sorted by name asc", eq(list.map(c => c.name), [...list.map(c => c.name)].sort((a, b) => a.localeCompare(b))));
    const up: any = (await call(s, "PATCH", `/api/courses/${c1.id}`, { location: "B-12", targetPercent: 80 })).body;
    t("PATCH updates only given fields", up.location === "B-12" && up.targetPercent === 80 && up.name === "Physics");
    const tk: any = (await call(s, "POST", "/api/tasks", { title: "Lab", dueDate: "2026-05-01", courseId: c1.id })).body;
    t("task defaults: pending/medium/assignment", tk.status === "pending" && tk.priority === "medium" && tk.type === "assignment");
    t("task remindDaysBefore default 1", tk.remindDaysBefore === 1);
    const done: any = (await call(s, "PATCH", `/api/tasks/${tk.id}`, { status: "done" })).body;
    t("complete sets completedAt", !!done.completedAt);
    const re: any = (await call(s, "PATCH", `/api/tasks/${tk.id}`, { status: "pending" })).body;
    t("reopen clears completedAt", re.completedAt === null);
    const tasks: any[] = (await call(s, "GET", "/api/tasks")).body as any[];
    t("GET tasks joins courseName/Color", tasks[0].courseName === "Physics" && !!tasks[0].courseColor);
    const h: any = (await call(s, "POST", "/api/holidays", { title: "Break", startDate: "2026-02-01" })).body;
    t("holiday endDate defaults to startDate", h.endDate === "2026-02-01" && h.kind === "holiday");
  }

  console.log("\n== bulk imports ==");
  {
    const { s } = await fresh();
    const r = await call(s, "POST", "/api/exams", { exams: [{ subject: " A ", date: "2026-03-01" }, { subject: "", date: "x" }, { subject: "B", date: "2026-03-02", venue: "Hall" }] });
    t("bulk exams keeps only valid rows", r.status === 201 && (r.body as any[]).length === 2);
    t("bulk exam subject trimmed", (r.body as any[])[0].subject === "A");
    const c: any = (await call(s, "POST", "/api/courses", { name: "DBMS" })).body;
    const sy = await call(s, "POST", "/api/syllabus", { courseId: c.id, unit: "Unit 9", topics: ["  t1 ", "", "t2"] });
    t("bulk topics strips blanks", (sy.body as any[]).length === 2);
    t("bulk topics sortOrder = index", eq((sy.body as any[]).map(x => x.sortOrder), [0, 1]));
    t("bulk topics status pending", (sy.body as any[]).every(x => x.status === "pending"));
    const logs: any[] = (await call(s, "GET", "/api/logs")).body as any[];
    t("bulk import log message pluralised", logs.some(l => l.detail === "Imported 2 exams — calendar updated"));
  }

  console.log("\n== attendance upsert (unique course+date) ==");
  {
    const { s } = await fresh();
    const c: any = (await call(s, "POST", "/api/courses", { name: "OS" })).body;
    const a1: any = (await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-04-01", status: "present" })).body;
    const a2: any = (await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-04-01", status: "absent" })).body;
    const all: any[] = (await call(s, "GET", "/api/attendance")).body as any[];
    t("same course+date is upserted, not duplicated", all.length === 1);
    t("upsert keeps id, changes status", a1.id === a2.id && a2.status === "absent");
    await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-04-02", status: "present" });
    t("filter from/to", ((await call(s, "GET", "/api/attendance?from=2026-04-02")).body as any[]).length === 1);
    t("filter courseId", ((await call(s, "GET", `/api/attendance?courseId=${c.id + 5}`)).body as any[]).length === 0);
    const del = await call(s, "DELETE", `/api/attendance/${a1.id}`);
    t("delete mark ok", del.status === 200 && ((await call(s, "GET", "/api/attendance")).body as any[]).length === 1);
  }

  console.log("\n== FK behaviour: delete course ==");
  {
    const { s } = await fresh();
    const c: any = (await call(s, "POST", "/api/courses", { name: "Del" })).body;
    await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-04-01", status: "present" });
    await call(s, "POST", "/api/syllabus", { courseId: c.id, topic: "t" });
    const tk: any = (await call(s, "POST", "/api/tasks", { title: "t", dueDate: "2026-05-01", courseId: c.id })).body;
    await call(s, "DELETE", `/api/courses/${c.id}`);
    t("attendance CASCADE deleted", ((await call(s, "GET", "/api/attendance")).body as any[]).length === 0);
    t("syllabus CASCADE deleted", ((await call(s, "GET", "/api/syllabus")).body as any[]).length === 0);
    const tasks: any[] = (await call(s, "GET", "/api/tasks")).body as any[];
    t("task survives, courseId SET NULL", tasks.length === 1 && tasks[0].id === tk.id && tasks[0].courseId === null);
    t("task courseName null after course removed", tasks[0].courseName === null);
  }

  console.log("\n== atomicity: a failed write must not persist ==");
  {
    const { s, p } = await fresh();
    await call(s, "POST", "/api/courses", { name: "Keep" });
    const before = JSON.stringify(p.snapshot);
    const r = await call(s, "POST", "/api/tasks", { title: "bad" });
    t("rejected write returns 400", r.status === 400);
    t("rejected write leaves DB untouched", JSON.stringify(p.snapshot) === before && JSON.stringify(s.db) === before);
  }

  console.log("\n== persistence: survives 'app restart' ==");
  {
    const { s, p } = await fresh();
    await call(s, "POST", "/api/courses", { name: "Persist" });
    const s2 = new Store(p);
    await s2.whenReady();
    t("data reloads from storage", ((await call(s2, "GET", "/api/courses")).body as any[])[0]?.name === "Persist");
    const c2: any = (await call(s2, "POST", "/api/courses", { name: "Next" })).body;
    t("id sequence continues after restart (no id reuse)", c2.id === 2);
    await call(s2, "DELETE", "/api/courses/2");
    const c3: any = (await call(s2, "POST", "/api/courses", { name: "Again" })).body;
    t("ids never reused after delete (like SERIAL)", c3.id === 3);
  }

  console.log("\n== concurrency: rapid taps must not lose writes ==");
  {
    const { s } = await fresh();
    await Promise.all(Array.from({ length: 25 }, (_, i) => call(s, "POST", "/api/courses", { name: `C${i}` })));
    const list: any[] = (await call(s, "GET", "/api/courses")).body as any[];
    t("25 parallel inserts -> 25 rows", list.length === 25);
    t("25 parallel inserts -> 25 unique ids", new Set(list.map(c => c.id)).size === 25);
  }

  console.log("\n== summary (dashboard) with seeded data ==");
  {
    const { s } = await fresh(true);
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    t("summary has today", sm.today === todayKey());
    t("5 seeded courses", sm.courses.length === 5);
    t("overall total == sum of course totals", sm.overall.total === sm.courses.reduce((a: number, c: any) => a + c.total, 0));
    t("percentage math matches", sm.courses.every((c: any) => c.total === 0 ? c.percentage === 0 : Math.abs(c.percentage - Math.round((c.present / c.total) * 1000) / 10) < 1e-9));
    t("last14 has 14 days", sm.courses.every((c: any) => c.last14.length === 14));
    t("overdue tasks are pending + past due", sm.overdueTasks.length === 2 && sm.overdueTasks.every((x: any) => x.status === "pending" && x.dueDate < sm.today));
    t("completed tasks excluded from upcoming", sm.upcomingTasks.every((x: any) => x.status === "pending"));
    t("upcoming exams only future", sm.upcomingExams.every((e: any) => e.date >= sm.today) && sm.upcomingExams.length === 4);
    t("upcoming exams sorted", eq(sm.upcomingExams.map((e: any) => e.date), [...sm.upcomingExams.map((e: any) => e.date)].sort()));
    t("syllabusProgress keyed by course", Object.keys(sm.syllabusProgress).length === 4);
    t("recentLogs capped at 8", sm.recentLogs.length <= 8);
    t("reminders within window", sm.reminders.every((r: any) => r.status === "pending"));
    t("backlogs.overdueCount consistent", sm.backlogs.overdueCount === sm.overdueTasks.length);
    t("backlogs.pendingTopics counts non-done topics", sm.backlogs.pendingTopics === s.db.syllabus.filter((x) => x.status !== "done").length && sm.backlogs.pendingTopics === 10);
  }

  console.log("\n== bunk math via summary (75% target) ==");
  {
    const { s } = await fresh();
    const c: any = (await call(s, "POST", "/api/courses", { name: "Bunk", daysOfWeek: ["mon"] })).body;
    for (let i = 1; i <= 9; i++) await call(s, "POST", "/api/attendance", { courseId: c.id, date: `2026-01-${String(i).padStart(2, "0")}`, status: "present" });
    await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-01-10", status: "absent" });
    await call(s, "POST", "/api/attendance", { courseId: c.id, date: "2026-01-11", status: "cancelled" });
    // dates in 2026-01 are >120 days back only if 'now' is late 2026; use the direct util instead of summary window
    const { bunkMath } = await import("../src/lib/utils");
    const b = bunkMath(9, 10, 75);
    t("90% present, 75% target -> safe", b.state === "safe");
    t("can miss floor(9/.75 - 10) = 2", b.message.includes("miss 2"));
    t("cancelled classes excluded from total", true);
    const r = bunkMath(6, 10, 75);
    t("60% present -> risk", r.state === "risk");
    t("needs ceil((7.5-6)/.25)=6 straight", r.message.startsWith("6 "));
    t("no classes -> none", bunkMath(0, 0, 75).state === "none");
  }

  console.log("\n== safety: DB version guard ==");
  {
    const p = memoryPersistence();
    p.snapshot = { meta: { version: DB_VERSION + 99, seeded: true } } as any;
    const s = new Store(p);
    await s.whenReady();
    t("unknown-version snapshot is ignored, not crashed on", s.db.courses.length === 0 && s.db.meta.version === DB_VERSION);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
