/**
 * On-device API router. A line-for-line behavioral port of every Next.js route
 * handler in the original app (/api/courses, /tasks, /exams, /holidays,
 * /syllabus, /attendance, /logs, /summary, /health, /report).
 *
 * Contract: handle(method, url, body) -> { status, body }.
 * Errors mirror the originals: 400 for validation, 404 for missing rows.
 */
import { format, parseISO, startOfMonth, subDays } from "date-fns";
import type { DB, Store } from "./store";
import {
  bunkMath,
  COURSE_COLORS,
  countScheduledLectures,
  DOW_ORDER,
  dowKey,
  eachDateKey,
  pct,
  todayKey,
} from "@/lib/utils";
import type {
  AttendanceRow,
  CourseRow,
  CourseStat,
  ExamRow,
  HolidayRow,
  SlotRow,
  SyllabusRow,
  TaskRow,
} from "@/lib/types";

export type ApiResult = { status: number; body: unknown };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
const bad = (m: string, s = 400) => new HttpError(s, m);

type Body = Record<string, unknown> | null;

function log(db: DB, action: string, entity: string, detail: string, now: string) {
  const id = ++db.seq.logs;
  db.logs.push({ id, action, entity, detail, createdAt: now });
}

const str = (v: unknown, d = "") => (v === undefined || v === null ? d : String(v));


/* ------------------------------ course slots ------------------------------ */
type SlotIn = { dayOfWeek: string; startTime: string; endTime: string; label: string };

/** Port of cleanSlots(): keep only entries with a valid weekday, coerce the rest to strings. */
function cleanSlots(raw: unknown): SlotIn[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(DOW_ORDER as readonly string[]);
  const out: SlotIn[] = [];
  for (const s of raw as Record<string, unknown>[]) {
    if (!s || typeof s.dayOfWeek !== "string" || !valid.has(s.dayOfWeek)) continue;
    out.push({
      dayOfWeek: s.dayOfWeek,
      startTime: String(s.startTime ?? ""),
      endTime: String(s.endTime ?? ""),
      label: String(s.label ?? ""),
    });
  }
  return out;
}

/** ORDER BY sort_order ASC, start_time ASC (the original's exact ordering). */
const bySlotOrder = (a: SlotRow, b: SlotRow) =>
  a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime);

const slotsOf = (db: DB, courseId: number) =>
  db.slots.filter((s) => s.courseId === courseId).sort(bySlotOrder);

const withSlots = (db: DB, c: CourseRow): CourseRow => ({ ...c, slots: slotsOf(db, c.id) });

function insertSlots(db: DB, courseId: number, slots: SlotIn[]) {
  slots.forEach((s, i) => {
    db.slots.push({
      id: ++db.seq.slots,
      courseId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label,
      sortOrder: i,
    });
  });
}

/* ------------------------------ sorting ------------------------------ */
const byStr =
  <T,>(pick: (x: T) => string) =>
  (a: T, b: T) =>
    pick(a).localeCompare(pick(b));

/** Postgres text ordering is locale-aware; localeCompare is the closest match. */
const nameAsc = byStr<CourseRow>((c) => c.name);

function joinTask(db: DB, t: DB["tasks"][number]): TaskRow {
  const c = t.courseId ? db.courses.find((x) => x.id === t.courseId) : undefined;
  return { ...t, courseName: c?.name ?? null, courseColor: c?.color ?? null };
}
function joinExam(db: DB, e: DB["exams"][number]): ExamRow {
  const c = e.courseId ? db.courses.find((x) => x.id === e.courseId) : undefined;
  return { ...e, courseColor: c?.color ?? null };
}

/* ------------------------------ summary ------------------------------ */
function summary(db: DB) {
  const today = todayKey();
  const dow = dowKey();
  const from = format(subDays(new Date(), 120), "yyyy-MM-dd");

  const courseRows = [...db.courses].sort(nameAsc);
  const attendanceRows = db.attendance.filter((a) => a.date >= from);
  // Unfiltered — the exam window below can reach further back than the
  // rolling 120-day window the main ring uses.
  const allAttendanceByCourse = new Map<number, AttendanceRow[]>();
  for (const a of db.attendance) {
    const arr = allAttendanceByCourse.get(a.courseId) ?? [];
    arr.push(a);
    allAttendanceByCourse.set(a.courseId, arr);
  }
  const examsByCourse = new Map<number, typeof db.exams>();
  for (const e of db.exams) {
    if (e.courseId == null) continue;
    const arr = examsByCourse.get(e.courseId) ?? [];
    arr.push(e);
    examsByCourse.set(e.courseId, arr);
  }
  const taskRows = db.tasks
    .map((t) => joinTask(db, t))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
  const examRows = db.exams
    .filter((e) => e.date >= today)
    .map((e) => joinExam(db, e))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const holidayRows = [...db.holidays].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const syllabusRows = db.syllabus;
  const logRows = [...db.logs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .slice(0, 8);

  const holidaySet = new Set<string>();
  for (const h of holidayRows)
    for (const k of eachDateKey(h.startDate, h.endDate)) holidaySet.add(k);

  const byCourse = new Map<number, AttendanceRow[]>();
  for (const a of attendanceRows) {
    const arr = byCourse.get(a.courseId) ?? [];
    arr.push(a);
    byCourse.set(a.courseId, arr);
  }

  const slotsByCourse = new Map<number, SlotRow[]>();
  for (const sl of [...db.slots].sort(bySlotOrder)) {
    const arr = slotsByCourse.get(sl.courseId) ?? [];
    arr.push(sl);
    slotsByCourse.set(sl.courseId, arr);
  }

  const courseStats = courseRows.map((c) => {
    const marks = (byCourse.get(c.id) ?? []).sort(
      (a, b) => a.date.localeCompare(b.date) || a.session - b.session
    );
    const present = marks.filter((m) => m.status === "present").length;
    const absent = marks.filter((m) => m.status === "absent").length;
    const cancelled = marks.filter((m) => m.status === "cancelled").length;
    const total = present + absent;
    const todayMarks = marks.filter((m) => m.date === today);
    const todayMark = todayMarks[0] ?? null;
    const last14 = Array.from({ length: 14 }, (_, i) => {
      const key = format(subDays(new Date(), 13 - i), "yyyy-MM-dd");
      const m = marks.find((x) => x.date === key);
      return { date: key, status: m ? m.status : null };
    });
    const mySlots = slotsByCourse.get(c.id) ?? [];
    let todaySlots = mySlots
      .filter((sl) => sl.dayOfWeek === dow)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    // legacy fallback (as in the original): days set on the course but no slot rows.
    if (todaySlots.length === 0 && (c.daysOfWeek ?? []).includes(dow)) {
      todaySlots = [
        {
          id: -c.id,
          courseId: c.id,
          dayOfWeek: dow,
          startTime: c.startTime ?? "",
          endTime: c.endTime ?? "",
          label: "",
          sortOrder: 0,
        },
      ];
    }

    // Attendance measured specifically between this course's start date and
    // the nearest exam scheduled for it — not the rolling 120-day window
    // used for the main ring above.
    let examWindow: CourseStat["examWindow"] = null;
    const startDate = c.startDate;
    const nextExam = (examsByCourse.get(c.id) ?? [])
      .filter((e) => e.date >= startDate)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (startDate && nextExam) {
      const windowMarks = (allAttendanceByCourse.get(c.id) ?? []).filter(
        (a) => a.date >= startDate && a.date <= nextExam.date
      );
      const wPresent = windowMarks.filter((m) => m.status === "present").length;
      const wAbsent = windowMarks.filter((m) => m.status === "absent").length;
      const wCancelled = windowMarks.filter((m) => m.status === "cancelled").length;
      const scheduled = countScheduledLectures(mySlots, holidaySet, startDate, nextExam.date);
      examWindow = {
        examDate: nextExam.date,
        examSubject: nextExam.subject,
        startDate,
        present: wPresent,
        absent: wAbsent,
        cancelled: wCancelled,
        scheduled,
        percentage: pct(wPresent, wPresent + wAbsent),
      };
    }

    return {
      ...c,
      present,
      absent,
      cancelled,
      total,
      percentage: pct(present, total),
      bunk: bunkMath(present, total, c.targetPercent),
      todayMark,
      todayMarks,
      slots: mySlots,
      todaySlots,
      meetsToday: !holidaySet.has(today) && todaySlots.length > 0,
      last14,
      examWindow,
    };
  });

  const overallPresent = courseStats.reduce((s, c) => s + c.present, 0);
  const overallTotal = courseStats.reduce((s, c) => s + c.total, 0);

  const pending = taskRows.filter((t) => t.status === "pending");
  const overdue = pending.filter((t) => t.dueDate < today);
  const dueSoon = pending.filter((t) => t.dueDate >= today);
  const reminders = pending.filter((t) => {
    const diff =
      (new Date(t.dueDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) /
      86400000;
    return diff >= 0 && diff <= (t.remindDaysBefore ?? 1);
  });

  const syllabusByCourse = new Map<number, { done: number; total: number }>();
  for (const s of syllabusRows) {
    const cur = syllabusByCourse.get(s.courseId) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (s.status === "done") cur.done += 1;
    syllabusByCourse.set(s.courseId, cur);
  }

  const holidayToday = holidayRows.find((h) => h.startDate <= today && h.endDate >= today) ?? null;
  const upcomingHolidays = holidayRows.filter((h) => h.endDate >= today);
  const riskCourses = courseStats.filter((c) => c.total > 0 && c.percentage < c.targetPercent);
  const pendingTopics = syllabusRows.filter((s) => s.status !== "done").length;

  return {
    today,
    holidayToday,
    courses: courseStats,
    todayLectures: courseStats
      .filter((c) => c.meetsToday)
      .sort((a, b) =>
        (a.todaySlots[0]?.startTime ?? "99").localeCompare(b.todaySlots[0]?.startTime ?? "99")
      ),
    overall: {
      present: overallPresent,
      total: overallTotal,
      percentage: pct(overallPresent, overallTotal),
    },
    upcomingTasks: dueSoon.slice(0, 6),
    overdueTasks: overdue,
    reminders,
    upcomingExams: examRows.slice(0, 4),
    upcomingHolidays: upcomingHolidays.slice(0, 4),
    syllabusProgress: Object.fromEntries(syllabusByCourse),
    recentLogs: logRows,
    backlogs: {
      overdueCount: overdue.length,
      riskCourses: riskCourses.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        percentage: c.percentage,
        targetPercent: c.targetPercent,
        message: c.bunk.message,
      })),
      pendingTopics,
    },
  };
}

/* ------------------------------- report -------------------------------- */
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Port of /api/report's buildCsv(). Returns the same text, built from the local store. */
function buildReport(db: DB, opts: { from?: string; to?: string }) {
  const today = todayKey();
  const from = opts.from || format(startOfMonth(parseISO(today)), "yyyy-MM-dd");
  const to = opts.to || today;

  const courseRows = [...db.courses].sort(nameAsc);
  const allMarks = [...db.attendance].sort((a, b) => a.date.localeCompare(b.date));
  const filtered = allMarks.filter((m) => m.date >= from && m.date <= to);
  const holidayRows = db.holidays;
  const taskRows = [...db.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const holidaySet = new Set<string>();
  for (const h of holidayRows)
    for (const k of eachDateKey(h.startDate, h.endDate)) holidaySet.add(k);

  const marksByCourseDate = new Map<string, (typeof filtered)[number]>();
  for (const m of filtered) marksByCourseDate.set(`${m.courseId}|${m.date}`, m);

  const slotsByCourse = new Map<number, SlotRow[]>();
  for (const s of db.slots) {
    const arr = slotsByCourse.get(s.courseId) ?? [];
    arr.push(s);
    slotsByCourse.set(s.courseId, arr);
  }

  const days = eachDateKey(from, to);
  const lines: string[] = [];

  lines.push("# ScholarFlow attendance report");
  lines.push(["generated", "from", "to", "date"].map(csvEscape).join(","));
  lines.push([today, from, to, today].map(csvEscape).join(","));
  lines.push("");
  lines.push("# Semester summary");
  lines.push(
    ["course", "code", "target_percent", "present", "absent", "cancelled", "percentage", "status"]
      .map(csvEscape)
      .join(",")
  );
  for (const c of courseRows) {
    const marks = filtered.filter((m) => m.courseId === c.id);
    const present = marks.filter((m) => m.status === "present").length;
    const absent = marks.filter((m) => m.status === "absent").length;
    const cancelled = marks.filter((m) => m.status === "cancelled").length;
    const total = present + absent;
    const percent = pct(present, total);
    const state = total === 0 ? "no data" : percent >= c.targetPercent ? "on track" : "at risk";
    lines.push(
      [c.name, c.code, c.targetPercent, present, absent, cancelled, percent, state]
        .map(csvEscape)
        .join(",")
    );
  }
  lines.push("");

  lines.push("# Day-by-day (every scheduled class in the range)");
  lines.push(["date", "course", "code", "scheduled_time", "status", "note"].map(csvEscape).join(","));
  for (const day of days) {
    const dow = dowKey(parseISO(day));
    if (holidaySet.has(day)) {
      for (const c of courseRows) {
        if (!(c.daysOfWeek ?? []).includes(dow)) continue;
        lines.push([day, c.name, c.code, "holiday", "holiday", ""].map(csvEscape).join(","));
      }
      continue;
    }
    for (const c of courseRows) {
      const slots = (slotsByCourse.get(c.id) ?? []).filter((s) => s.dayOfWeek === dow);
      if (!slots.length) continue;
      const mark = marksByCourseDate.get(`${c.id}|${day}`);
      for (const s of slots) {
        const t = s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : s.startTime;
        lines.push(
          [day, c.name, c.code, t, mark ? mark.status : "not marked", mark ? mark.note : ""]
            .map(csvEscape)
            .join(",")
        );
      }
    }
  }
  lines.push("");

  lines.push("# All marked attendance records");
  lines.push(["date", "course", "code", "status", "note"].map(csvEscape).join(","));
  for (const m of filtered) {
    const c = courseRows.find((x) => x.id === m.courseId);
    lines.push([m.date, c?.name ?? "", c?.code ?? "", m.status, m.note ?? ""].map(csvEscape).join(","));
  }
  lines.push("");

  lines.push("# Reminders & tasks");
  lines.push(["title", "type", "priority", "due_date", "status", "course"].map(csvEscape).join(","));
  for (const t of taskRows) {
    const c = courseRows.find((x) => x.id === t.courseId);
    lines.push(
      [t.title, t.type, t.priority, t.dueDate, t.status, c?.name ?? ""].map(csvEscape).join(",")
    );
  }

  return { csv: lines.join("\r\n"), generatedAt: today, from, to };
}

/* ------------------------------ handlers ------------------------------ */
const VALID_ATT = new Set(["present", "absent", "cancelled"]);
const VALID_TOPIC = new Set(["pending", "in_progress", "done"]);

export async function handle(
  store: Store,
  method: string,
  rawUrl: string,
  body: Body
): Promise<ApiResult> {
  try {
    const url = new URL(rawUrl, "http://local");
    const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const [res, idPart] = parts;
    const id = idPart !== undefined ? Number(idPart) : undefined;
    const q = url.searchParams;
    const m = method.toUpperCase();

    /* ---------- reads ---------- */
    if (m === "GET") {
      switch (res) {
        case "health":
          return { status: 200, body: { ok: true } };
        case "summary":
          return { status: 200, body: await store.read((db) => summary(db)) };
        case "report":
          // Always JSON here — the local router has no way to stream a real
          // text/csv Response, so the Report sheet reads `.csv` off the body
          // and hands it to saveTextFile() instead of downloading a blob.
          return {
            status: 200,
            body: await store.read((db) =>
              buildReport(db, { from: q.get("from") ?? undefined, to: q.get("to") ?? undefined })
            ),
          };
        case "courses":
          return {
            status: 200,
            body: await store.read((db) => [...db.courses].sort(nameAsc).map((c) => withSlots(db, c))),
          };
        case "tasks":
          return {
            status: 200,
            body: await store.read((db) =>
              db.tasks
                .map((t) => joinTask(db, t))
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
            ),
          };
        case "exams":
          return {
            status: 200,
            body: await store.read((db) =>
              db.exams
                .map((e) => joinExam(db, e))
                .sort(
                  (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
                )
            ),
          };
        case "holidays":
          return {
            status: 200,
            body: await store.read((db) =>
              [...db.holidays].sort((a, b) => a.startDate.localeCompare(b.startDate))
            ),
          };
        case "syllabus": {
          const cid = q.get("courseId");
          return {
            status: 200,
            body: await store.read((db) =>
              db.syllabus
                .filter((s) => (cid ? s.courseId === Number(cid) : true))
                .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
            ),
          };
        }
        case "attendance": {
          const from = q.get("from");
          const to = q.get("to");
          const cid = q.get("courseId");
          return {
            status: 200,
            body: await store.read((db) =>
              db.attendance
                .filter(
                  (a) =>
                    (!from || a.date >= from) &&
                    (!to || a.date <= to) &&
                    (!cid || a.courseId === Number(cid))
                )
                .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
            ),
          };
        }
        case "logs":
          return {
            status: 200,
            body: await store.read((db) =>
              [...db.logs]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
                .slice(0, 120)
            ),
          };
      }
      throw bad("Not found", 404);
    }

    /* ---------- writes ---------- */
    const result = await store.transact((db): ApiResult => {
      const now = store.now();
      const b = (body ?? {}) as Record<string, unknown>;

      switch (`${m} ${res}`) {
        /* ===== courses ===== */
        case "POST courses": {
          if (!body || typeof b.name !== "string" || !b.name.trim())
            throw bad("Course name is required");
          const color =
            typeof b.color === "string" && b.color
              ? b.color
              : COURSE_COLORS[db.courses.length % COURSE_COLORS.length];

          const slots = cleanSlots(b.slots);
          // deriveLegacy(): days/start come from slots when present, else from the legacy fields.
          const days =
            slots.length > 0
              ? [...new Set(slots.map((x) => x.dayOfWeek))]
              : Array.isArray(b.daysOfWeek)
                ? (b.daysOfWeek as string[])
                : [];
          const start =
            slots
              .map((x) => x.startTime)
              .filter(Boolean)
              .sort()[0] ?? String(b.startTime ?? "");

          const row: CourseRow = {
            id: ++db.seq.courses,
            name: b.name.trim(),
            code: str(b.code),
            color,
            instructor: str(b.instructor),
            location: str(b.location),
            daysOfWeek: days,
            startTime: start,
            endTime: str(b.endTime),
            targetPercent: Number(b.targetPercent) || 75,
            startDate: str(b.startDate),
            createdAt: now,
          };
          db.courses.push(row);

          // No explicit slots but legacy days given -> synthesise uniform slots (as the original does).
          const finalSlots: SlotIn[] =
            slots.length > 0
              ? slots
              : days.map((d) => ({ dayOfWeek: d, startTime: start, endTime: str(b.endTime), label: "" }));
          insertSlots(db, row.id, finalSlots);

          log(db, "create", "course", `Added course “${row.name}”`, now);
          return { status: 201, body: withSlots(db, row) };
        }
        case "PATCH courses": {
          if (!id) throw bad("Invalid id");
          const row = db.courses.find((c) => c.id === id);
          if (!row) throw bad("Not found", 404);
          // Original: `slots` is only honoured if it is an array; otherwise slots are left alone.
          const slots = b.slots !== undefined && Array.isArray(b.slots) ? cleanSlots(b.slots) : null;

          if (b.name !== undefined) row.name = String(b.name);
          if (b.color !== undefined) row.color = String(b.color);
          if (b.code !== undefined) row.code = String(b.code);
          if (b.instructor !== undefined) row.instructor = String(b.instructor);
          if (b.location !== undefined) row.location = String(b.location);
          if (b.endTime !== undefined) row.endTime = String(b.endTime);
          if (b.targetPercent !== undefined) row.targetPercent = Number(b.targetPercent);
          if (b.startDate !== undefined) row.startDate = String(b.startDate);
          if (slots) {
            row.daysOfWeek = [...new Set(slots.map((x) => x.dayOfWeek))];
            row.startTime =
              slots
                .map((x) => x.startTime)
                .filter(Boolean)
                .sort()[0] ?? "";
            // Replace ALL slots for this course.
            db.slots = db.slots.filter((x) => x.courseId !== id);
            insertSlots(db, id, slots);
          }
          log(db, "update", "course", `Updated course “${row.name}”`, now);
          return { status: 200, body: withSlots(db, row) };
        }
        case "DELETE courses": {
          if (!id) throw bad("Invalid id");
          const i = db.courses.findIndex((c) => c.id === id);
          if (i < 0) throw bad("Not found", 404);
          const [row] = db.courses.splice(i, 1);
          // Mirror FK rules: slots + attendance + syllabus CASCADE, tasks + exams SET NULL.
          db.slots = db.slots.filter((x) => x.courseId !== id);
          db.attendance = db.attendance.filter((a) => a.courseId !== id);
          db.syllabus = db.syllabus.filter((s) => s.courseId !== id);
          for (const t of db.tasks) if (t.courseId === id) t.courseId = null;
          for (const e of db.exams) if (e.courseId === id) e.courseId = null;
          log(db, "delete", "course", `Removed course “${row.name}”`, now);
          return { status: 200, body: { ok: true } };
        }

        /* ===== tasks ===== */
        case "POST tasks": {
          if (!body || typeof b.title !== "string" || !b.title.trim()) throw bad("Title is required");
          if (typeof b.dueDate !== "string" || !b.dueDate) throw bad("Due date is required");
          const row = {
            id: ++db.seq.tasks,
            title: b.title.trim(),
            type: str(b.type, "assignment") as TaskRow["type"],
            courseId: b.courseId ? Number(b.courseId) : null,
            dueDate: b.dueDate,
            dueTime: str(b.dueTime),
            priority: str(b.priority, "medium") as TaskRow["priority"],
            status: "pending" as const,
            notes: str(b.notes),
            remindDaysBefore: Number(b.remindDaysBefore ?? 1),
            createdAt: now,
            completedAt: null,
          };
          db.tasks.push(row);
          log(db, "create", "task", `New ${row.type} “${row.title}” due ${row.dueDate}`, now);
          return { status: 201, body: row };
        }
        case "PATCH tasks": {
          if (!id) throw bad("Invalid id");
          const row = db.tasks.find((t) => t.id === id);
          if (!row) throw bad("Not found", 404);
          if (b.title !== undefined) row.title = String(b.title);
          if (b.type !== undefined) row.type = String(b.type) as TaskRow["type"];
          if (b.courseId !== undefined) row.courseId = b.courseId ? Number(b.courseId) : null;
          if (b.dueDate !== undefined) row.dueDate = String(b.dueDate);
          if (b.dueTime !== undefined) row.dueTime = String(b.dueTime);
          if (b.priority !== undefined) row.priority = String(b.priority) as TaskRow["priority"];
          if (b.notes !== undefined) row.notes = String(b.notes);
          if (b.status !== undefined) {
            row.status = String(b.status) as TaskRow["status"];
            row.completedAt = b.status === "done" ? now : null;
          }
          if (b.status === "done") log(db, "complete", "task", `Completed “${row.title}”`, now);
          else if (b.status === "pending") log(db, "update", "task", `Reopened “${row.title}”`, now);
          else log(db, "update", "task", `Updated task “${row.title}”`, now);
          return { status: 200, body: row };
        }
        case "DELETE tasks": {
          if (!id) throw bad("Invalid id");
          const i = db.tasks.findIndex((t) => t.id === id);
          if (i < 0) throw bad("Not found", 404);
          const [row] = db.tasks.splice(i, 1);
          log(db, "delete", "task", `Deleted task “${row.title}”`, now);
          return { status: 200, body: { ok: true } };
        }

        /* ===== exams ===== */
        case "POST exams": {
          if (!body) throw bad("Invalid body");
          if (Array.isArray(b.exams)) {
            const clean = (b.exams as Record<string, unknown>[])
              .filter((e) => e && e.subject && e.date)
              .map((e) => ({
                id: ++db.seq.exams,
                subject: String(e.subject).trim(),
                courseId: null as number | null,
                date: String(e.date),
                startTime: str(e.startTime),
                endTime: str(e.endTime),
                venue: str(e.venue),
                notes: str(e.notes),
                createdAt: now,
              }));
            if (!clean.length) throw bad("No valid exam rows found");
            db.exams.push(...clean);
            log(
              db,
              "create",
              "exam",
              `Imported ${clean.length} exam${clean.length > 1 ? "s" : ""} — calendar updated`,
              now
            );
            return { status: 201, body: clean };
          }
          if (typeof b.subject !== "string" || !b.subject.trim()) throw bad("Subject is required");
          if (typeof b.date !== "string" || !b.date) throw bad("Date is required");
          const linkedCourseId =
            b.courseId !== undefined && b.courseId !== null && b.courseId !== ""
              ? Number(b.courseId)
              : null;
          const row = {
            id: ++db.seq.exams,
            subject: b.subject.trim(),
            courseId:
              linkedCourseId !== null && db.courses.some((c) => c.id === linkedCourseId)
                ? linkedCourseId
                : null,
            date: b.date,
            startTime: str(b.startTime),
            endTime: str(b.endTime),
            venue: str(b.venue),
            notes: str(b.notes),
            createdAt: now,
          };
          db.exams.push(row);
          log(db, "create", "exam", `Scheduled exam “${row.subject}” on ${row.date}`, now);
          return { status: 201, body: row };
        }
        case "DELETE exams": {
          if (!id) throw bad("Invalid id");
          const i = db.exams.findIndex((e) => e.id === id);
          if (i < 0) throw bad("Not found", 404);
          const [row] = db.exams.splice(i, 1);
          log(db, "delete", "exam", `Removed exam “${row.subject}”`, now);
          return { status: 200, body: { ok: true } };
        }

        /* ===== holidays ===== */
        case "POST holidays": {
          if (!body || typeof b.title !== "string" || !b.title.trim()) throw bad("Title is required");
          if (typeof b.startDate !== "string" || !b.startDate) throw bad("Start date is required");
          const row: HolidayRow = {
            id: ++db.seq.holidays,
            title: b.title.trim(),
            startDate: b.startDate,
            endDate: (b.endDate as string) || b.startDate,
            kind: str(b.kind, "holiday") as HolidayRow["kind"],
            createdAt: now,
          };
          db.holidays.push(row);
          log(
            db,
            "create",
            "holiday",
            `Marked ${row.kind} “${row.title}” (${row.startDate}${
              row.endDate !== row.startDate ? ` → ${row.endDate}` : ""
            })`,
            now
          );
          return { status: 201, body: row };
        }
        case "DELETE holidays": {
          if (!id) throw bad("Invalid id");
          const i = db.holidays.findIndex((h) => h.id === id);
          if (i < 0) throw bad("Not found", 404);
          const [row] = db.holidays.splice(i, 1);
          log(db, "delete", "holiday", `Removed holiday “${row.title}”`, now);
          return { status: 200, body: { ok: true } };
        }

        /* ===== syllabus ===== */
        case "POST syllabus": {
          if (!body) throw bad("Invalid body");
          if (Array.isArray(b.topics)) {
            if (!b.courseId) throw bad("courseId is required");
            const unit = str(b.unit, "Unit 1");
            const clean = (b.topics as unknown[])
              .map((t) => String(t).trim())
              .filter(Boolean)
              .map(
                (t, i): SyllabusRow => ({
                  id: ++db.seq.syllabus,
                  courseId: Number(b.courseId),
                  unit,
                  topic: t,
                  status: "pending",
                  sortOrder: i,
                  createdAt: now,
                })
              );
            if (!clean.length) throw bad("No topics found");
            db.syllabus.push(...clean);
            log(db, "create", "syllabus", `Added ${clean.length} topics to ${unit}`, now);
            return { status: 201, body: clean };
          }
          if (!b.courseId || typeof b.topic !== "string" || !b.topic.trim())
            throw bad("courseId and topic are required");
          const row: SyllabusRow = {
            id: ++db.seq.syllabus,
            courseId: Number(b.courseId),
            unit: str(b.unit, "Unit 1"),
            topic: b.topic.trim(),
            status: "pending",
            sortOrder: Number(b.sortOrder ?? 0),
            createdAt: now,
          };
          db.syllabus.push(row);
          log(db, "create", "syllabus", `Added topic “${row.topic}”`, now);
          return { status: 201, body: row };
        }
        case "PATCH syllabus": {
          if (!id) throw bad("Invalid id");
          const row = db.syllabus.find((s) => s.id === id);
          if (!row) throw bad("Not found", 404);
          if (b.status !== undefined && VALID_TOPIC.has(b.status as string))
            row.status = b.status as SyllabusRow["status"];
          if (b.topic !== undefined) row.topic = String(b.topic);
          if (b.unit !== undefined) row.unit = String(b.unit);
          if (b.status === "done") log(db, "complete", "syllabus", `Finished topic “${row.topic}”`, now);
          return { status: 200, body: row };
        }
        case "DELETE syllabus": {
          if (!id) throw bad("Invalid id");
          const i = db.syllabus.findIndex((s) => s.id === id);
          if (i < 0) throw bad("Not found", 404);
          const [row] = db.syllabus.splice(i, 1);
          log(db, "delete", "syllabus", `Removed topic “${row.topic}”`, now);
          return { status: 200, body: { ok: true } };
        }

        /* ===== attendance ===== */
        case "POST attendance": {
          if (!body) throw bad("Invalid body");
          if (!b.courseId || !b.date || !VALID_ATT.has(b.status as string))
            throw bad("courseId, date and valid status are required");
          const courseId = Number(b.courseId);
          const date = String(b.date);
          const status = b.status as AttendanceRow["status"];
          const note = str(b.note);
          // Session lets one date hold more than one lecture for the same
          // course (e.g. a subject that meets twice that day). Default 1
          // keeps every existing caller's "one mark per day" behaviour.
          const session =
            b.session !== undefined && Number.isFinite(Number(b.session)) && Number(b.session) > 0
              ? Math.floor(Number(b.session))
              : 1;
          // Unique (courseId, date, session): upsert, exactly like onConflictDoUpdate.
          let row = db.attendance.find(
            (a) => a.courseId === courseId && a.date === date && a.session === session
          );
          if (row) {
            row.status = status;
            row.note = note;
          } else {
            row = { id: ++db.seq.attendance, courseId, date, session, status, note, createdAt: now };
            db.attendance.push(row);
          }
          const c = db.courses.find((x) => x.id === courseId);
          const verb =
            status === "present" ? "Present" : status === "absent" ? "Absent" : "Class cancelled";
          const sessionNote = session > 1 ? ` (lecture ${session})` : "";
          log(db, "mark", "attendance", `${verb} — ${c?.name ?? "Course"} on ${date}${sessionNote}`, now);
          return { status: 201, body: row };
        }
        case "DELETE attendance": {
          if (!id) throw bad("Invalid id");
          const i = db.attendance.findIndex((a) => a.id === id);
          if (i < 0) throw bad("Not found", 404);
          const [row] = db.attendance.splice(i, 1);
          log(db, "delete", "attendance", `Cleared a mark for ${row.date}`, now);
          return { status: 200, body: { ok: true } };
        }
      }
      throw bad("Not found", 404);
    });
    return result;
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    console.error("[router] unexpected", e);
    return { status: 500, body: { error: "Internal error" } };
  }
}
