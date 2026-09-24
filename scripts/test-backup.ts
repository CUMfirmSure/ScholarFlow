/** Backup/restore safety tests. Restore is destructive, so failure modes get the most coverage. */
import { Store, memoryPersistence } from "../src/db/store";
import { handle } from "../src/db/router";
import { ensureSeeded } from "../src/db/seed";
import { makeBackup, parseBackup, restoreBackup, clearAllData, backupFilename } from "../src/db/backup";

let pass = 0, fail = 0;
const t = (n: string, ok: boolean, x = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${!ok && x ? "  -> " + x : ""}`); };
const call = (s: Store, m: string, u: string, b: any = null) => handle(s, m, u, b);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const mk = async (seed = true) => { const p = memoryPersistence(); const s = new Store(p); if (seed) await ensureSeeded(s); return { s, p }; };

async function main() {
  console.log("\n== round trip ==");
  {
    const { s } = await mk();
    const file = makeBackup(s.db);
    const { db } = parseBackup(JSON.stringify(file));
    t("counts recorded in header", file.counts.courses === 5 && file.counts.tasks === 7);
    t("courses identical after round trip", JSON.stringify(db.courses) === JSON.stringify(s.db.courses));
    t("tasks identical after round trip", JSON.stringify(db.tasks) === JSON.stringify(s.db.tasks));
    t("attendance identical", JSON.stringify(db.attendance) === JSON.stringify(s.db.attendance));
    t("syllabus identical", JSON.stringify(db.syllabus) === JSON.stringify(s.db.syllabus));
    t("seq counters >= max id (no collision on next insert)", db.seq.courses >= 5 && db.seq.attendance >= db.attendance.length);
    t("filename is dated & .json", /^scholarflow-backup-\d{4}-\d{2}-\d{2}\.json$/.test(backupFilename(new Date(2026, 8, 3))) && backupFilename(new Date(2026, 8, 3)).includes("2026-09-03"));
  }

  console.log("\n== restore into a DIFFERENT (empty) device ==");
  {
    const a = await mk(); const b = await mk(false);
    const raw = JSON.stringify(makeBackup(a.s.db));
    const r = await restoreBackup(b.s, raw);
    t("restore ok", r.ok === true);
    t("new device has all courses", ((await call(b.s, "GET", "/api/courses")).body as any[]).length === 5);
    t("summary works on restored data", (await call(b.s, "GET", "/api/summary")).status === 200);
    const nc: any = (await call(b.s, "POST", "/api/courses", { name: "After restore" })).body;
    t("new insert after restore gets a fresh id (no collision)", nc.id === 6);
    t("restore persisted to storage", b.p.snapshot?.courses.length === 6);
  }

  console.log("\n== id-reuse hazard (restore older backup after deleting records) ==");
  {
    const { s } = await mk(false);
    for (let i = 0; i < 3; i++) await call(s, "POST", "/api/courses", { name: `C${i}` });
    const oldBackup = JSON.stringify(makeBackup(s.db));       // has ids 1..3, seq=3
    await call(s, "POST", "/api/courses", { name: "C3" });    // id 4
    await call(s, "POST", "/api/courses", { name: "C4" });    // id 5
    await call(s, "DELETE", "/api/courses/4"); await call(s, "DELETE", "/api/courses/5");
    await restoreBackup(s, oldBackup);
    const nc: any = (await call(s, "POST", "/api/courses", { name: "New" })).body;
    t("id after restoring an old backup is NOT a reused id (>=6)", nc.id >= 6, `got ${nc.id}`);
  }

  console.log("\n== rejects garbage without touching live data ==");
  {
    const { s, p } = await mk();
    const before = JSON.stringify(s.db);
    const bads: [string, string][] = [
      ["not json", "hello {{{"],
      ["empty string", ""],
      ["json array", "[1,2,3]"],
      ["json null", "null"],
      ["wrong format tag", JSON.stringify({ format: "other", schema: 1, data: {} })],
      ["missing schema", JSON.stringify({ format: "scholarflow-backup", data: {} })],
      ["newer schema", JSON.stringify({ format: "scholarflow-backup", schema: 99, data: {} })],
      ["no data section", JSON.stringify({ format: "scholarflow-backup", schema: 1 })],
      ["missing a table", JSON.stringify({ format: "scholarflow-backup", schema: 1, data: { courses: [] } })],
    ];
    for (const [name, raw] of bads) {
      const r = await restoreBackup(s, raw);
      t(`rejects: ${name}`, r.ok === false && typeof (r as any).error === "string" && (r as any).error.length > 0);
    }
    t("live DB byte-identical after all rejections", JSON.stringify(s.db) === before);
    t("storage untouched after rejections", p.snapshot === null || JSON.stringify(p.snapshot) === before);
  }

  console.log("\n== rejects structurally-corrupt data ==");
  {
    const { s } = await mk();
    const good = makeBackup(s.db);
    const tamper = (fn: (b: any) => void) => { const b: any = clone(good); fn(b); return JSON.stringify(b); };
    const cases: [string, string][] = [
      ["duplicate course id", tamper(b => { b.data.courses[1].id = b.data.courses[0].id; })],
      ["course with blank name", tamper(b => { b.data.courses[0].name = "  "; })],
      ["course with non-integer id", tamper(b => { b.data.courses[0].id = 1.5; })],
      ["course with id 0", tamper(b => { b.data.courses[0].id = 0; })],
      ["attendance orphaned (course missing)", tamper(b => { b.data.attendance[0].courseId = 9999; })],
      ["attendance bad status", tamper(b => { b.data.attendance[0].status = "late"; })],
      ["attendance bad date", tamper(b => { b.data.attendance[0].date = "yesterday"; })],
      ["duplicate attendance course+date", tamper(b => { b.data.attendance.push({ ...b.data.attendance[0], id: 9000 }); })],
      ["syllabus orphaned", tamper(b => { b.data.syllabus[0].courseId = 9999; })],
      ["syllabus empty topic", tamper(b => { b.data.syllabus[0].topic = ""; })],
      ["task no title", tamper(b => { b.data.tasks[0].title = ""; })],
      ["task bad dueDate", tamper(b => { b.data.tasks[0].dueDate = "31/12/2026"; })],
      ["duplicate task ids", tamper(b => { b.data.tasks[1].id = b.data.tasks[0].id; })],
      ["exam bad date", tamper(b => { b.data.exams[0].date = "soon"; })],
      ["holiday no title", tamper(b => { b.data.holidays[0].title = ""; })],
      ["table is not an array", tamper(b => { b.data.tasks = {}; })],
      ["row is not an object", tamper(b => { b.data.tasks[0] = "oops"; })],
    ];
    for (const [name, raw] of cases) {
      const before = JSON.stringify(s.db);
      const r = await restoreBackup(s, raw);
      t(`rejects: ${name}`, r.ok === false, JSON.stringify(r).slice(0, 80));
      if (JSON.stringify(s.db) !== before) t(`  (live data changed by rejected '${name}'!)`, false);
    }
  }

  console.log("\n== repairs recoverable damage instead of refusing ==");
  {
    const { s } = await mk(false);
    const c: any = (await call(s, "POST", "/api/courses", { name: "Keep" })).body;
    await call(s, "POST", "/api/tasks", { title: "T", dueDate: "2026-11-01", courseId: c.id });
    await call(s, "POST", "/api/exams", { subject: "E", date: "2026-11-02" });
    const b: any = clone(makeBackup(s.db));
    b.data.tasks[0].courseId = 777;                 // dangling link
    b.data.exams[0].courseId = 888;
    const r: any = await restoreBackup(s, JSON.stringify(b));
    t("dangling task/exam course links are repaired, not fatal", r.ok === true);
    t("repairs are reported to the user", r.repaired.length === 2);
    const tasks: any[] = (await call(s, "GET", "/api/tasks")).body as any[];
    t("repaired task has courseId null", tasks[0].courseId === null);
  }

  console.log("\n== sanitises hostile / sloppy field values ==");
  {
    const { s } = await mk(false);
    await call(s, "POST", "/api/courses", { name: "X", daysOfWeek: ["mon"] });
    const b: any = clone(makeBackup(s.db));
    b.data.courses[0].color = "javascript:alert(1)";
    b.data.courses[0].daysOfWeek = ["mon", "funday", 5, null];
    b.data.courses[0].targetPercent = 5000;
    b.data.courses[0].name = "  Trim me ";
    await restoreBackup(s, JSON.stringify(b));
    const c: any = ((await call(s, "GET", "/api/courses")).body as any[])[0];
    t("non-hex color replaced with safe default", /^#[0-9a-fA-F]{6}$/.test(c.color));
    t("invalid weekdays stripped", JSON.stringify(c.daysOfWeek) === '["mon"]');
    t("targetPercent clamped to 100", c.targetPercent === 100);
    t("name trimmed", c.name === "Trim me");
    b.data.courses[0].targetPercent = -20;
    await restoreBackup(s, JSON.stringify(b));
    t("negative target falls back/clamps into 1..100", (((await call(s, "GET", "/api/courses")).body as any[])[0].targetPercent) >= 1);
  }

  console.log("\n== unknown extra fields are dropped (no prototype/junk smuggling) ==");
  {
    const { s } = await mk(false);
    await call(s, "POST", "/api/courses", { name: "X" });
    const b: any = clone(makeBackup(s.db));
    b.data.courses[0].__proto__ = { polluted: true };
    b.data.courses[0].evil = "<img src=x onerror=alert(1)>";
    await restoreBackup(s, JSON.stringify(b));
    const c: any = ((await call(s, "GET", "/api/courses")).body as any[])[0];
    t("unknown field 'evil' not stored", !("evil" in c));
    t("Object prototype not polluted", ({} as any).polluted === undefined);
  }

  console.log("\n== clear all data ==");
  {
    const { s } = await mk();
    await clearAllData(s);
    t("all tables empty", s.db.courses.length + s.db.tasks.length + s.db.attendance.length + s.db.syllabus.length + s.db.exams.length + s.db.holidays.length + s.db.logs.length === 0);
    t("marked seeded so demo data never returns", s.db.meta.seeded === true);
    const s2 = new Store((s as any).persistence);
    await ensureSeeded(s2);
    t("relaunch after clear does NOT re-seed demo data", s2.db.courses.length === 0);
    const nc: any = (await call(s, "POST", "/api/courses", { name: "Mine" })).body;
    t("ids continue after clear (no reuse)", nc.id === 6, `got ${nc.id}`);
    t("summary works on empty db", (await call(s, "GET", "/api/summary")).status === 200);
    const sm: any = (await call(s, "GET", "/api/summary")).body;
    t("empty-state percentage is 0, not NaN", sm.overall.percentage === 0 && !Number.isNaN(sm.overall.percentage));
  }

  console.log("\n== large realistic backup ==");
  {
    const { s } = await mk(false);
    for (let i = 0; i < 12; i++) await call(s, "POST", "/api/courses", { name: `Course ${i}`, daysOfWeek: ["mon", "tue"] });
    const ids = ((await call(s, "GET", "/api/courses")).body as any[]).map(c => c.id);
    let n = 0;
    for (let d = 0; d < 150; d++) for (const id of ids.slice(0, 6))
      await call(s, "POST", "/api/attendance", { courseId: id, date: `2027-${String(1 + (d % 12)).padStart(2, "0")}-${String(1 + Math.floor(d / 12)).padStart(2, "0")}`, status: d % 5 ? "present" : "absent" }), n++;
    const raw = JSON.stringify(makeBackup(s.db));
    const t0 = Date.now();
    const b2 = await mk(false);
    const r: any = await restoreBackup(b2.s, raw);
    t(`restore of ${(raw.length / 1024).toFixed(0)} KB backup ok`, r.ok === true);
    t("restore fast (<1s)", Date.now() - t0 < 1000, `${Date.now() - t0}ms`);
    t("attendance count preserved", b2.s.db.attendance.length === s.db.attendance.length);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
