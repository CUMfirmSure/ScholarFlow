/**
 * Demo data, ported from the original db/seed.ts. Only runs on a brand-new
 * install (meta.seeded === false). Users can wipe it from the Logs page or
 * Settings and start clean.
 */
import { addDays, format, getDay, subDays } from "date-fns";
import type { DB, Store } from "./store";
import type { CourseRow, SyllabusRow } from "@/lib/types";

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function buildSeed(db: DB, nowIso: string, base: Date = new Date()) {
  const key = (d: Date) => format(d, "yyyy-MM-dd");
  const plus = (n: number) => key(addDays(base, n));
  const minus = (n: number) => key(subDays(base, n));

  const mk = (
    name: string,
    code: string,
    color: string,
    instructor: string,
    location: string,
    daysOfWeek: string[],
    startTime: string,
    endTime: string
  ): CourseRow => ({
    id: ++db.seq.courses,
    name,
    code,
    color,
    instructor,
    location,
    daysOfWeek,
    startTime,
    endTime,
    targetPercent: 75,
    createdAt: nowIso,
  });

  const maths = mk("Engineering Mathematics", "MA301", "#6C5CE7", "Dr. Rao", "LH-2", ["mon", "wed", "fri"], "09:00", "09:55");
  const dbms = mk("Database Management Systems", "CS302", "#4D9DE0", "Prof. Iyer", "LH-5", ["tue", "thu"], "10:05", "11:00");
  const os = mk("Operating Systems", "CS303", "#22C55E", "Dr. Kulkarni", "LH-3", ["mon", "tue", "thu"], "11:15", "12:10");
  const cn = mk("Computer Networks", "CS304", "#F59E0B", "Prof. Mehta", "LH-6", ["wed", "fri"], "14:00", "14:55");
  const lab = mk("DBMS Lab", "CS312", "#EF476F", "Prof. Iyer", "Lab-4", ["fri"], "15:05", "17:00");
  const all = [maths, dbms, os, cn, lab];
  db.courses.push(...all);

  // Attendance: past 24 days on scheduled weekdays, deterministic ~78% present.
  for (let i = 24; i >= 1; i--) {
    const d = subDays(base, i);
    const dow = DOW[getDay(d)];
    for (const c of all) {
      if (!c.daysOfWeek.includes(dow)) continue;
      const roll = Math.sin(i * 7 + c.id * 13) * 0.5 + 0.5;
      const status = roll < 0.08 ? "cancelled" : roll < 0.22 ? "absent" : "present";
      db.attendance.push({
        id: ++db.seq.attendance,
        courseId: c.id,
        date: key(d),
        status,
        note: "",
        createdAt: nowIso,
      });
    }
  }

  const task = (
    title: string,
    type: "assignment" | "test" | "quiz" | "lab" | "other",
    courseId: number,
    dueDate: string,
    priority: "low" | "medium" | "high",
    notes = "",
    done = false
  ) =>
    db.tasks.push({
      id: ++db.seq.tasks,
      title,
      type,
      courseId,
      dueDate,
      dueTime: "",
      priority,
      status: done ? "done" : "pending",
      notes,
      remindDaysBefore: 1,
      createdAt: nowIso,
      completedAt: done ? nowIso : null,
    });

  task("Normalize the library schema to 3NF", "assignment", dbms.id, plus(2), "high", "Show 1NF → 2NF → 3NF steps with the keys underlined.");
  task("Unit test — deadlocks & scheduling", "test", os.id, plus(4), "high", "Banker's algorithm will definitely come.");
  task("Fourier series problem set 4", "assignment", maths.id, plus(6), "medium");
  task("Lab record — ER diagram + DDL scripts", "lab", lab.id, minus(1), "medium", "Backlog: get it signed in Friday lab.");
  task("Subnetting worksheet B", "assignment", cn.id, minus(3), "low");
  task("Quiz — process vs thread", "quiz", os.id, minus(6), "medium", "", true);
  task("Eigen values practice sheet", "assignment", maths.id, minus(8), "medium", "", true);

  const exam = (subject: string, n: number, s: string, e: string, venue: string, notes = "") =>
    db.exams.push({
      id: ++db.seq.exams,
      subject,
      courseId: null,
      date: plus(n),
      startTime: s,
      endTime: e,
      venue,
      notes,
      createdAt: nowIso,
    });
  exam("Engineering Mathematics", 12, "09:30", "12:30", "Exam Hall A", "Units 3–5 emphasis");
  exam("Database Management Systems", 14, "09:30", "12:30", "Exam Hall B");
  exam("Operating Systems", 16, "13:30", "16:30", "Exam Hall A");
  exam("Computer Networks", 18, "09:30", "12:30", "Exam Hall C");

  db.holidays.push(
    { id: ++db.seq.holidays, title: "Festival Break", startDate: plus(8), endDate: plus(9), kind: "holiday", createdAt: nowIso },
    { id: ++db.seq.holidays, title: "Founder's Day — Institute Holiday", startDate: plus(20), endDate: plus(20), kind: "holiday", createdAt: nowIso }
  );

  const topic = (courseId: number, unit: string, t: string, status: SyllabusRow["status"], i: number) =>
    db.syllabus.push({ id: ++db.seq.syllabus, courseId, unit, topic: t, status, sortOrder: i, createdAt: nowIso });
  topic(dbms.id, "Unit 1 — Intro & ER Model", "DBMS architecture & users", "done", 0);
  topic(dbms.id, "Unit 1 — Intro & ER Model", "ER diagrams & relationship sets", "done", 1);
  topic(dbms.id, "Unit 2 — Relational Model", "Keys, constraints & schema refinement", "done", 2);
  topic(dbms.id, "Unit 2 — Relational Model", "Relational algebra queries", "in_progress", 3);
  topic(dbms.id, "Unit 3 — SQL & Normalization", "Joins, subqueries, views", "pending", 4);
  topic(dbms.id, "Unit 3 — SQL & Normalization", "1NF → BCNF decomposition", "pending", 5);
  topic(os.id, "Unit 1 — Processes", "Process states & PCB", "done", 0);
  topic(os.id, "Unit 1 — Processes", "CPU scheduling algorithms", "in_progress", 1);
  topic(os.id, "Unit 2 — Concurrency", "Semaphores & monitors", "pending", 2);
  topic(os.id, "Unit 2 — Concurrency", "Deadlock detection & avoidance", "pending", 3);
  topic(maths.id, "Unit 1 — Linear Algebra", "Eigen values & vectors", "done", 0);
  topic(maths.id, "Unit 2 — Fourier", "Fourier series expansion", "in_progress", 1);
  topic(maths.id, "Unit 2 — Fourier", "Half-range series", "pending", 2);
  topic(cn.id, "Unit 1 — Fundamentals", "OSI vs TCP/IP model", "done", 0);
  topic(cn.id, "Unit 2 — Network Layer", "IPv4 addressing & subnetting", "in_progress", 1);
  topic(cn.id, "Unit 2 — Network Layer", "Routing algorithms", "pending", 2);

  const l = (action: string, entity: string, detail: string) =>
    db.logs.push({ id: ++db.seq.logs, action, entity, detail, createdAt: nowIso });
  l("create", "course", "Semester workspace set up with 5 courses");
  l("create", "exam", `Exam timetable imported — 4 papers, first on ${plus(12)}`);
  l("mark", "attendance", `Attendance history backfilled up to ${key(base)}`);

  db.meta.seeded = true;
}

/** Seed once, on a fresh install only. */
export async function ensureSeeded(store: Store) {
  await store.whenReady();
  if (store.db.meta.seeded) return;
  await store.transact((db) => buildSeed(db, store.now()));
}
