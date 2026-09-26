/**
 * On-device data store. Replaces PostgreSQL + drizzle.
 * Same tables, same column names as the original schema, so API payloads are
 * byte-compatible with what the existing pages already expect.
 *
 * Persistence: whole-DB snapshot to IndexedDB (via idb-keyval) with a
 * localStorage mirror as a safety net. Writes are serialized through a queue so
 * two quick taps can never interleave and lose data.
 */
import type {
  AttendanceRow,
  CourseRow,
  SlotRow,
  ExamRow,
  HolidayRow,
  LogRow,
  SyllabusRow,
  TaskRow,
  HolidayRow as _H,
} from "@/lib/types";

void (null as unknown as _H);

export type DB = {
  seq: Record<TableName, number>;
  courses: CourseRow[];
  slots: SlotRow[];
  attendance: AttendanceRow[];
  tasks: Omit<TaskRow, "courseName" | "courseColor">[];
  exams: Omit<ExamRow, "courseColor">[];
  holidays: HolidayRow[];
  syllabus: SyllabusRow[];
  logs: LogRow[];
  meta: { version: number; seeded: boolean };
};

export type TableName =
  | "courses"
  | "slots"
  | "attendance"
  | "tasks"
  | "exams"
  | "holidays"
  | "syllabus"
  | "logs";

export const DB_VERSION = 3;
const KEY = "scholarflow:db:v1";

export function emptyDB(): DB {
  return {
    seq: {
      courses: 0,
      slots: 0,
      attendance: 0,
      tasks: 0,
      exams: 0,
      holidays: 0,
      syllabus: 0,
      logs: 0,
    },
    courses: [],
    slots: [],
    attendance: [],
    tasks: [],
    exams: [],
    holidays: [],
    syllabus: [],
    logs: [],
    meta: { version: DB_VERSION, seeded: false },
  };
}

/**
 * Upgrade an older on-disk snapshot to the current shape WITHOUT losing data.
 * v1 -> v2: courses gained per-day time slots. Each v1 course meant "these days,
 * one shared start/end", so we synthesise one slot per day from that.
 * Returns null if the snapshot is unusable (caller then starts empty).
 */
export function migrate(raw: unknown): DB | null {
  if (!raw || typeof raw !== "object") return null;
  const snap = raw as Partial<DB> & { meta?: { version?: number; seeded?: boolean } };
  const v = snap.meta?.version;
  if (typeof v !== "number" || v > DB_VERSION) return null; // unknown/newer: refuse, don't corrupt

  const base = emptyDB();
  const db: DB = {
    ...base,
    ...(snap as DB),
    seq: { ...base.seq, ...(snap.seq ?? {}) },
    meta: { version: DB_VERSION, seeded: !!snap.meta?.seeded },
  };
  for (const t of ["courses", "slots", "attendance", "tasks", "exams", "holidays", "syllabus", "logs"] as const) {
    if (!Array.isArray(db[t])) (db as Record<string, unknown>)[t] = [];
  }

  if (v < 2) {
    db.slots = [];
    db.seq.slots = 0;
    for (const c of db.courses) {
      const days = Array.isArray(c.daysOfWeek) ? c.daysOfWeek : [];
      days.forEach((d, i) => {
        db.slots.push({
          id: ++db.seq.slots,
          courseId: c.id,
          dayOfWeek: d,
          startTime: c.startTime ?? "",
          endTime: c.endTime ?? "",
          label: "",
          sortOrder: i,
        });
      });
    }
  }

  /**
   * v2 -> v3: courses gain a `startDate` (defaults to blank — "not set" —
   * rather than guessing), and attendance rows gain a `session` number so a
   * subject that meets twice in one day can hold two separate marks instead
   * of overwriting each other. Every pre-existing mark is simply "session 1".
   */
  if (v < 3) {
    for (const c of db.courses) {
      if (typeof (c as { startDate?: string }).startDate !== "string") {
        (c as { startDate: string }).startDate = "";
      }
    }
    for (const a of db.attendance) {
      if (typeof (a as { session?: number }).session !== "number") {
        (a as { session: number }).session = 1;
      }
    }
  }
  return db;
}

/** Pluggable persistence so the engine is testable in Node. */
export interface Persistence {
  load(): Promise<DB | null>;
  save(db: DB): Promise<void>;
}

export class Store {
  db: DB = emptyDB();
  private queue: Promise<void> = Promise.resolve();
  private ready: Promise<void>;

  constructor(private persistence: Persistence) {
    this.ready = this.init();
  }

  private async init() {
    try {
      const loaded = await this.persistence.load();
      const migrated = migrate(loaded);
      if (migrated) {
        this.db = migrated;
        // Persist the upgrade immediately so a crash mid-session can't leave a half-migrated file.
        if ((loaded as DB).meta?.version !== DB_VERSION) await this.persistence.save(this.db);
      }
    } catch (e) {
      console.error("[store] load failed, starting empty", e);
    }
  }

  whenReady() {
    return this.ready;
  }

  nextId(t: TableName): number {
    this.db.seq[t] += 1;
    return this.db.seq[t];
  }

  now(): string {
    return new Date().toISOString();
  }

  /**
   * Run a mutation atomically: mutate a working copy, and only commit + persist
   * if it did not throw. A failed request can never leave a half-written DB.
   */
  async transact<T>(fn: (db: DB) => T): Promise<T> {
    await this.ready;
    let result!: T;
    let err: unknown;
    let failed = false;
    this.queue = this.queue.then(async () => {
      const draft = structuredClone(this.db);
      try {
        result = fn(draft);
      } catch (e) {
        failed = true;
        err = e;
        return;
      }
      this.db = draft;
      try {
        await this.persistence.save(this.db);
      } catch (e) {
        console.error("[store] persist failed", e);
      }
    });
    await this.queue;
    if (failed) throw err;
    return result;
  }

  /** Read-only view (no persistence, no clone). */
  async read<T>(fn: (db: DB) => T): Promise<T> {
    await this.ready;
    await this.queue;
    return fn(this.db);
  }

  async replaceAll(next: DB) {
    await this.ready;
    this.queue = this.queue.then(async () => {
      this.db = next;
      await this.persistence.save(this.db);
    });
    await this.queue;
  }

  async reset() {
    await this.replaceAll(emptyDB());
  }
}

/** Browser/Android WebView persistence: IndexedDB primary, localStorage mirror. */
export function browserPersistence(): Persistence {
  return {
    async load() {
      const { get } = await import("idb-keyval");
      try {
        const v = (await get(KEY)) as DB | undefined;
        if (v) return v;
      } catch {
        /* fall through to mirror */
      }
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as DB) : null;
      } catch {
        return null;
      }
    },
    async save(db) {
      const { set } = await import("idb-keyval");
      let ok = false;
      try {
        await set(KEY, db);
        ok = true;
      } catch (e) {
        console.error("[store] idb save failed", e);
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
        ok = true;
      } catch {
        /* quota — IDB is primary */
      }
      if (!ok) throw new Error("No persistent storage available");
    },
  };
}

/** In-memory persistence for tests. */
export function memoryPersistence(): Persistence & { snapshot: DB | null } {
  const p = {
    snapshot: null as DB | null,
    async load() {
      return p.snapshot ? structuredClone(p.snapshot) : null;
    },
    async save(db: DB) {
      p.snapshot = structuredClone(db);
    },
  };
  return p;
}
