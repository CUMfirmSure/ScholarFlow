/**
 * Backup / restore for the on-device database.
 *
 * Design rules:
 *  - A backup is a plain JSON file the user owns. Human-readable, versioned.
 *  - Restore NEVER trusts the file. Every row is validated and re-normalised
 *    before it can touch the live DB, and the swap is atomic: if anything is
 *    wrong the existing data is left completely untouched.
 *  - Referential integrity is re-checked (orphaned attendance/syllabus rows are
 *    rejected, dangling task/exam course links are nulled), so a hand-edited or
 *    corrupt file cannot poison the app.
 */
import { DB_VERSION, emptyDB, type DB, type Store, type TableName } from "./store";

export const BACKUP_FORMAT = "scholarflow-backup";
export const BACKUP_SCHEMA = 1;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  schema: number;
  exportedAt: string;
  app: string;
  counts: Record<string, number>;
  data: Pick<DB, "courses" | "attendance" | "tasks" | "exams" | "holidays" | "syllabus" | "logs">;
};

export type RestoreReport =
  | { ok: true; counts: Record<string, number>; repaired: string[] }
  | { ok: false; error: string };

const TABLES: TableName[] = ["courses", "attendance", "tasks", "exams", "holidays", "syllabus", "logs"];

export function makeBackup(db: DB, nowIso = new Date().toISOString()): BackupFile {
  const data = {
    courses: db.courses,
    attendance: db.attendance,
    tasks: db.tasks,
    exams: db.exams,
    holidays: db.holidays,
    syllabus: db.syllabus,
    logs: db.logs,
  };
  return {
    format: BACKUP_FORMAT,
    schema: BACKUP_SCHEMA,
    exportedAt: nowIso,
    app: "ScholarFlow",
    counts: Object.fromEntries(TABLES.map((t) => [t, data[t].length])),
    data,
  };
}

export function backupFilename(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `scholarflow-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/* ------------------------- validation helpers ------------------------- */
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const s = (v: unknown, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v);
const oneOf = <T extends string>(v: unknown, set: readonly T[], d: T): T =>
  (set as readonly string[]).includes(v as string) ? (v as T) : d;

class Bad extends Error {}
const need = (cond: unknown, msg: string) => {
  if (!cond) throw new Bad(msg);
};

/** Parse + validate + normalise. Throws Bad with a user-readable message. */
export function parseBackup(raw: string): { db: DB; repaired: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Bad("That file isn't valid JSON. Pick a ScholarFlow backup (.json).");
  }
  need(isObj(json), "Unrecognised file contents.");
  const f = json as Record<string, unknown>;
  need(f.format === BACKUP_FORMAT, "This isn't a ScholarFlow backup file.");
  need(typeof f.schema === "number", "Backup is missing its version.");
  need(
    (f.schema as number) <= BACKUP_SCHEMA,
    "This backup was made by a newer version of ScholarFlow. Update the app, then try again."
  );
  need(isObj(f.data), "Backup has no data section.");
  const d = f.data as Record<string, unknown>;
  for (const t of TABLES) need(Array.isArray(d[t]), `Backup is missing the “${t}” table.`);

  const repaired: string[] = [];
  const db = emptyDB();
  const seen = (t: TableName) => new Set<number>();

  /* courses */
  const courseIds = new Set<number>();
  for (const [i, r] of (d.courses as unknown[]).entries()) {
    need(isObj(r) && isId(r.id), `Course #${i + 1} has an invalid id.`);
    const row = r as Record<string, unknown>;
    need(!courseIds.has(row.id as number), `Duplicate course id ${row.id}.`);
    need(typeof row.name === "string" && row.name.trim(), `Course #${i + 1} has no name.`);
    courseIds.add(row.id as number);
    db.courses.push({
      id: row.id as number,
      name: (row.name as string).trim(),
      code: s(row.code),
      color: /^#[0-9a-fA-F]{6}$/.test(s(row.color)) ? s(row.color) : "#6C5CE7",
      instructor: s(row.instructor),
      location: s(row.location),
      daysOfWeek: Array.isArray(row.daysOfWeek)
        ? (row.daysOfWeek as unknown[]).filter((x): x is string =>
            ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].includes(x as string)
          )
        : [],
      startTime: s(row.startTime),
      endTime: s(row.endTime),
      targetPercent: Math.min(100, Math.max(1, Number(row.targetPercent) || 75)),
      createdAt: s(row.createdAt, new Date().toISOString()),
    });
  }

  /* attendance — orphan rows are a hard error (cascade would have removed them) */
  const attKeys = new Set<string>();
  for (const [i, r] of (d.attendance as unknown[]).entries()) {
    need(isObj(r) && isId(r.id), `Attendance row #${i + 1} has an invalid id.`);
    const row = r as Record<string, unknown>;
    need(courseIds.has(row.courseId as number), `Attendance row #${i + 1} points to a course that isn't in the backup.`);
    need(isDate(row.date), `Attendance row #${i + 1} has a bad date.`);
    need(["present", "absent", "cancelled"].includes(row.status as string), `Attendance row #${i + 1} has a bad status.`);
    const key = `${row.courseId}|${row.date}`;
    need(!attKeys.has(key), `Duplicate attendance for one course on ${row.date}.`);
    attKeys.add(key);
    db.attendance.push({
      id: row.id as number,
      courseId: row.courseId as number,
      date: row.date as string,
      status: row.status as "present" | "absent" | "cancelled",
      note: s(row.note),
      createdAt: s(row.createdAt, new Date().toISOString()),
    });
  }

  /* tasks — dangling course link is repairable (matches ON DELETE SET NULL) */
  let nulledTasks = 0;
  for (const [i, r] of (d.tasks as unknown[]).entries()) {
    need(isObj(r) && isId(r.id), `Task #${i + 1} has an invalid id.`);
    const row = r as Record<string, unknown>;
    need(typeof row.title === "string" && row.title.trim(), `Task #${i + 1} has no title.`);
    need(isDate(row.dueDate), `Task “${row.title}” has a bad due date.`);
    let courseId: number | null = row.courseId == null ? null : Number(row.courseId);
    if (courseId !== null && !courseIds.has(courseId)) {
      courseId = null;
      nulledTasks++;
    }
    const status = oneOf(row.status, ["pending", "done"] as const, "pending");
    db.tasks.push({
      id: row.id as number,
      title: (row.title as string).trim(),
      type: oneOf(row.type, ["assignment", "test", "quiz", "lab", "other"] as const, "assignment"),
      courseId,
      dueDate: row.dueDate as string,
      dueTime: s(row.dueTime),
      priority: oneOf(row.priority, ["low", "medium", "high"] as const, "medium"),
      status,
      notes: s(row.notes),
      remindDaysBefore: Number.isFinite(Number(row.remindDaysBefore)) ? Number(row.remindDaysBefore) : 1,
      createdAt: s(row.createdAt, new Date().toISOString()),
      completedAt: status === "done" ? s(row.completedAt, new Date().toISOString()) : null,
    });
  }
  if (nulledTasks) repaired.push(`${nulledTasks} task${nulledTasks > 1 ? "s" : ""} unlinked from a missing course`);

  /* exams */
  let nulledExams = 0;
  for (const [i, r] of (d.exams as unknown[]).entries()) {
    need(isObj(r) && isId(r.id), `Exam #${i + 1} has an invalid id.`);
    const row = r as Record<string, unknown>;
    need(typeof row.subject === "string" && row.subject.trim(), `Exam #${i + 1} has no subject.`);
    need(isDate(row.date), `Exam “${row.subject}” has a bad date.`);
    let courseId: number | null = row.courseId == null ? null : Number(row.courseId);
    if (courseId !== null && !courseIds.has(courseId)) {
      courseId = null;
      nulledExams++;
    }
    db.exams.push({
      id: row.id as number,
      subject: (row.subject as string).trim(),
      courseId,
      date: row.date as string,
      startTime: s(row.startTime),
      endTime: s(row.endTime),
      venue: s(row.venue),
      notes: s(row.notes),
      createdAt: s(row.createdAt, new Date().toISOString()),
    });
  }
  if (nulledExams) repaired.push(`${nulledExams} exam${nulledExams > 1 ? "s" : ""} unlinked from a missing course`);

  /* holidays */
  for (const [i, r] of (d.holidays as unknown[]).entries()) {
    need(isObj(r) && isId(r.id), `Holiday #${i + 1} has an invalid id.`);
    const row = r as Record<string, unknown>;
    need(typeof row.title === "string" && row.title.trim(), `Holiday #${i + 1} has no title.`);
    need(isDate(row.startDate), `Holiday “${row.title}” has a bad start date.`);
    const end = isDate(row.endDate) ? (row.endDate as string) : (row.startDate as string);
    db.holidays.push({
      id: row.id as number,
      title: (row.title as string).trim(),
      startDate: row.startDate as string,
      endDate: end < (row.startDate as string) ? (row.startDate as string) : end,
      kind: oneOf(row.kind, ["holiday", "break", "personal"] as const, "holiday"),
      createdAt: s(row.createdAt, new Date().toISOString()),
    });
  }

  /* syllabus — orphans are a hard error */
  for (const [i, r] of (d.syllabus as unknown[]).entries()) {
    need(isObj(r) && isId(r.id), `Syllabus topic #${i + 1} has an invalid id.`);
    const row = r as Record<string, unknown>;
    need(courseIds.has(row.courseId as number), `Syllabus topic #${i + 1} points to a course that isn't in the backup.`);
    need(typeof row.topic === "string" && row.topic.trim(), `Syllabus topic #${i + 1} is empty.`);
    db.syllabus.push({
      id: row.id as number,
      courseId: row.courseId as number,
      unit: s(row.unit, "Unit 1"),
      topic: (row.topic as string).trim(),
      status: oneOf(row.status, ["pending", "in_progress", "done"] as const, "pending"),
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
      createdAt: s(row.createdAt, new Date().toISOString()),
    });
  }

  /* logs */
  for (const [i, r] of (d.logs as unknown[]).entries()) {
    need(isObj(r) && isId(r.id), `Log entry #${i + 1} has an invalid id.`);
    const row = r as Record<string, unknown>;
    db.logs.push({
      id: row.id as number,
      action: s(row.action),
      entity: s(row.entity),
      detail: s(row.detail),
      createdAt: s(row.createdAt, new Date().toISOString()),
    });
  }

  /* ids must be unique within each table (a shared-id file would corrupt updates/deletes) */
  for (const t of TABLES) {
    const ids = new Set<number>();
    for (const row of db[t] as { id: number }[]) {
      need(!ids.has(row.id), `Duplicate id ${row.id} in “${t}”.`);
      ids.add(row.id);
    }
    void seen;
  }

  /* Sequence counters must sit ABOVE every id, or the next insert would collide. */
  for (const t of TABLES) db.seq[t] = (db[t] as { id: number }[]).reduce((m, r) => Math.max(m, r.id), 0);

  db.meta = { version: DB_VERSION, seeded: true };
  return { db, repaired };
}

/** Atomic restore: validate fully first, then swap. On any error the live DB is untouched. */
export async function restoreBackup(store: Store, raw: string): Promise<RestoreReport> {
  let parsed: { db: DB; repaired: string[] };
  try {
    parsed = parseBackup(raw);
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    return { ok: false, error: "Couldn't read that file." };
  }
  try {
    // Preserve the highest sequence ever issued, so ids of records deleted since the
    // backup was taken are never handed out again to different records.
    await store.whenReady();
    for (const t of TABLES) parsed.db.seq[t] = Math.max(parsed.db.seq[t], store.db.seq[t]);
    await store.replaceAll(parsed.db);
  } catch {
    return { ok: false, error: "Restore failed while saving. Your existing data was not changed." };
  }
  return {
    ok: true,
    repaired: parsed.repaired,
    counts: Object.fromEntries(TABLES.map((t) => [t, parsed.db[t].length])),
  };
}

/** Wipe everything, including demo data, but keep the id sequences and mark as seeded so demo never returns. */
export async function clearAllData(store: Store) {
  await store.whenReady();
  const fresh = emptyDB();
  fresh.meta = { version: DB_VERSION, seeded: true };
  for (const t of TABLES) fresh.seq[t] = store.db.seq[t];
  await store.replaceAll(fresh);
}
