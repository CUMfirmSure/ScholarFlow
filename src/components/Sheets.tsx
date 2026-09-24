"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  Field,
  inputCls,
  ChipSelect,
  PrimaryButton,
} from "@/components/ui";
import {
  apiSend,
  OPEN_EVENT,
  REFRESH_EVENT,
  type SheetKind,
} from "@/lib/useApi";
import {
  COURSE_COLORS,
  TASK_TYPES,
  cn,
  todayKey,
} from "@/lib/utils";
import type { CourseRow } from "@/lib/types";
import {
  BookMarked,
  CalendarPlus,
  FileUp,
  GraduationCap,
  ListPlus,
  NotebookPen,
  Palmtree,
} from "lucide-react";

/* ------------------------------------------------------------------ */

const DOWS = [
  { k: "mon", l: "M" },
  { k: "tue", l: "T" },
  { k: "wed", l: "W" },
  { k: "thu", l: "T" },
  { k: "fri", l: "F" },
  { k: "sat", l: "S" },
  { k: "sun", l: "S" },
];

function useCourses() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  useEffect(() => {
    const load = () =>
      fetch("/api/courses", { cache: "no-store" })
        .then((r) => r.json())
        .then(setCourses)
        .catch(() => {});
    load();
    window.addEventListener(REFRESH_EVENT, load);
    return () => window.removeEventListener(REFRESH_EVENT, load);
  }, []);
  return courses;
}

/* ------------------------------- TASK ------------------------------ */

function TaskSheet({
  open,
  onClose,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  courses: CourseRow[];
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("assignment");
  const [courseId, setCourseId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(todayKey());
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState("medium");
  const [remind, setRemind] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setType("assignment");
      setCourseId(courses[0]?.id ?? null);
      setDueDate(todayKey());
      setDueTime("");
      setPriority("medium");
      setRemind("1");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    if (!title.trim() || !dueDate) return;
    setBusy(true);
    await apiSend("/api/tasks", "POST", {
      title,
      type,
      courseId,
      dueDate,
      dueTime,
      priority,
      notes,
      remindDaysBefore: Number(remind),
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New reminder"
      subtitle="Assignment, test or anything with a deadline"
    >
      <div className="space-y-5">
        <Field label="Title">
          <input
            className={inputCls}
            placeholder="e.g. Sorting algorithms worksheet"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Type">
          <ChipSelect
            options={TASK_TYPES.map((t) => t.key)}
            value={type}
            onChange={setType}
            render={(v) => TASK_TYPES.find((t) => t.key === v)!.label}
          />
        </Field>
        <Field label="Course">
          <select
            className={cn(inputCls, "appearance-none")}
            value={courseId ?? ""}
            onChange={(e) =>
              setCourseId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id} className="bg-surface">
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input
              type="date"
              className={inputCls}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label="Time (optional)">
            <input
              type="time"
              className={inputCls}
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <ChipSelect
              options={["low", "medium", "high"] as const}
              value={priority}
              onChange={setPriority}
            />
          </Field>
          <Field label="Remind me">
            <select
              className={cn(inputCls, "appearance-none")}
              value={remind}
              onChange={(e) => setRemind(e.target.value)}
            >
              <option value="0" className="bg-surface">On the day</option>
              <option value="1" className="bg-surface">1 day before</option>
              <option value="2" className="bg-surface">2 days before</option>
              <option value="3" className="bg-surface">3 days before</option>
            </select>
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea
            className={cn(inputCls, "min-h-20 resize-none")}
            placeholder="Pages, submission link, group members…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <PrimaryButton onClick={save} disabled={!title.trim() || !dueDate} loading={busy}>
          Save reminder
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/* ------------------------------ COURSE ----------------------------- */

function CourseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [instructor, setInstructor] = useState("");
  const [location, setLocation] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [target, setTarget] = useState("75");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(""); setCode(""); setInstructor(""); setLocation("");
      setDays([]); setStartTime(""); setEndTime("");
      setColor(COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)]);
      setTarget("75");
    }
  }, [open]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    await apiSend("/api/courses", "POST", {
      name, code, instructor, location,
      daysOfWeek: days, startTime, endTime, color,
      targetPercent: Number(target) || 75,
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add course"
      subtitle="Set its weekly schedule to unlock quick attendance"
    >
      <div className="space-y-5">
        <Field label="Course name">
          <input
            className={inputCls}
            placeholder="e.g. Operating Systems"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code">
            <input
              className={inputCls}
              placeholder="CS303"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label="Room">
            <input
              className={inputCls}
              placeholder="LH-3"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Instructor (optional)">
          <input
            className={inputCls}
            placeholder="Dr. Kulkarni"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
          />
        </Field>
        <Field label="Weekly schedule">
          <div className="flex gap-1.5">
            {DOWS.map((d) => {
              const active = days.includes(d.k);
              return (
                <button
                  key={d.k}
                  type="button"
                  onClick={() =>
                    setDays((p) =>
                      active ? p.filter((x) => x !== d.k) : [...p, d.k]
                    )
                  }
                  className={cn(
                    "pressable grid size-10 rounded-full border text-[13px] font-semibold transition-colors",
                    active
                      ? "border-primary/60 bg-primary/20 text-primary2"
                      : "border-line bg-white/[0.03] text-mute"
                  )}
                >
                  {d.l}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input
              type="time"
              className={inputCls}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="Ends">
            <input
              type="time"
              className={inputCls}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Colour">
          <div className="flex flex-wrap gap-2.5">
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "pressable size-9 rounded-full transition-transform",
                  color === c && "ring-2 ring-white/70 ring-offset-2 ring-offset-surface"
                )}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        <Field label="Min. attendance target">
          <select
            className={cn(inputCls, "appearance-none")}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {["65", "70", "75", "80", "85", "90"].map((t) => (
              <option key={t} value={t} className="bg-surface">
                {t}%
              </option>
            ))}
          </select>
        </Field>
        <PrimaryButton onClick={save} disabled={!name.trim()} loading={busy}>
          Add course
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/* ------------------------------- EXAM ------------------------------ */

function ExamSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(todayKey());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venue, setVenue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSubject(""); setDate(todayKey()); setStartTime("");
      setEndTime(""); setVenue(""); setNotes("");
    }
  }, [open]);

  async function save() {
    if (!subject.trim() || !date) return;
    setBusy(true);
    await apiSend("/api/exams", "POST", {
      subject, date, startTime, endTime, venue, notes,
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add exam"
      subtitle="It lands on your calendar instantly"
    >
      <div className="space-y-5">
        <Field label="Subject / paper">
          <input
            className={inputCls}
            placeholder="e.g. Operating Systems"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input
              type="time"
              className={inputCls}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="Ends">
            <input
              type="time"
              className={inputCls}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Venue (optional)">
          <input
            className={inputCls}
            placeholder="Exam Hall A"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)">
          <input
            className={inputCls}
            placeholder="Seating, syllabus scope…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <PrimaryButton onClick={save} disabled={!subject.trim() || !date} loading={busy}>
          Add to calendar
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/* ------------------------------ IMPORT ----------------------------- */

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setResult(null);
    }
  }, [open]);

  function parse(): { subject: string; date: string; startTime: string; venue: string }[] {
    const rows: { subject: string; date: string; startTime: string; venue: string }[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/[,|\t]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const [subject, dateRaw, timeRaw = "", venue = ""] = parts;
      // normalise date: accept YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY
      let date = dateRaw;
      const m = dateRaw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      if (m) {
        date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      rows.push({ subject, date, startTime: timeRaw, venue });
    }
    return rows;
  }

  async function save() {
    const exams = parse();
    if (!exams.length) {
      setResult("Couldn't find any valid rows — check the format below.");
      return;
    }
    setBusy(true);
    await apiSend("/api/exams", "POST", { exams });
    setBusy(false);
    setResult(`${exams.length} exam${exams.length > 1 ? "s" : ""} added to your calendar.`);
    setTimeout(onClose, 900);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import exam timetable"
      subtitle="Paste rows or upload a CSV — the calendar builds itself"
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-dashed border-line bg-white/[0.03] p-4 text-[12.5px] leading-relaxed text-mute">
          <p className="mb-1 font-semibold text-ink">One exam per line</p>
          <code className="text-primary2">
            Subject, YYYY-MM-DD, 09:30, Hall A
          </code>
          <p className="mt-1">
            Dates like <code className="text-ink">12/03/2026</code> work too.
            Time & venue are optional. Tabs from Excel paste cleanly.
          </p>
        </div>
        <textarea
          className={cn(inputCls, "min-h-36 resize-none font-mono text-[13px]")}
          placeholder={"Engineering Mathematics, 2026-03-10, 09:30, Hall A\nDBMS, 2026-03-12, 09:30, Hall B\nOperating Systems, 2026-03-14, 13:30"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="pressable flex flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-white/[0.04] px-4 py-3.5 text-[14px] font-semibold text-mute"
          >
            <FileUp size={16} />
            Upload .csv
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
              e.target.value = "";
            }}
          />
          <div className="flex-1">
            <PrimaryButton onClick={save} disabled={!text.trim()} loading={busy}>
              Build calendar
            </PrimaryButton>
          </div>
        </div>
        {result && (
          <p className="text-center text-[13px] font-medium text-primary2">
            {result}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* ----------------------------- HOLIDAY ----------------------------- */

function HolidaySheet({
  open,
  onClose,
  presetDate,
}: {
  open: boolean;
  onClose: () => void;
  presetDate?: string | null;
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayKey());
  const [endDate, setEndDate] = useState(todayKey());
  const [kind, setKind] = useState("holiday");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setStartDate(presetDate || todayKey());
      setEndDate(presetDate || todayKey());
      setKind("holiday");
    }
  }, [open, presetDate]);

  async function save() {
    if (!title.trim() || !startDate) return;
    setBusy(true);
    await apiSend("/api/holidays", "POST", {
      title,
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      kind,
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mark a holiday"
      subtitle="Attendance pauses and the calendar turns rose"
    >
      <div className="space-y-5">
        <Field label="Occasion">
          <input
            className={inputCls}
            placeholder="e.g. Festival break"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input
              type="date"
              className={inputCls}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className={inputCls}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Kind">
          <ChipSelect
            options={["holiday", "break", "personal"] as const}
            value={kind}
            onChange={setKind}
          />
        </Field>
        <PrimaryButton onClick={save} disabled={!title.trim()} loading={busy}>
          Mark holiday
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/* ------------------------------- TOPIC ------------------------------ */

function TopicSheet({
  open,
  onClose,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  courses: CourseRow[];
}) {
  const [courseId, setCourseId] = useState<number | null>(null);
  const [unit, setUnit] = useState("Unit 1");
  const [topics, setTopics] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCourseId(courses[0]?.id ?? null);
      setUnit("Unit 1");
      setTopics("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    if (!courseId || !topics.trim()) return;
    setBusy(true);
    await apiSend("/api/syllabus", "POST", {
      courseId,
      unit,
      topics: topics.split(/\r?\n/).map((t) => t.trim()).filter(Boolean),
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add syllabus topics"
      subtitle="Paste a unit's topics — one per line"
    >
      <div className="space-y-5">
        <Field label="Course">
          <select
            className={cn(inputCls, "appearance-none")}
            value={courseId ?? ""}
            onChange={(e) => setCourseId(Number(e.target.value))}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id} className="bg-surface">
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit / module">
          <input
            className={inputCls}
            placeholder="Unit 1 — Processes"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </Field>
        <Field label="Topics (one per line)">
          <textarea
            className={cn(inputCls, "min-h-32 resize-none")}
            placeholder={"Process states & PCB\nCPU scheduling algorithms\nSemaphores & monitors"}
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
          />
        </Field>
        <PrimaryButton onClick={save} disabled={!courseId || !topics.trim()} loading={busy}>
          Add topics
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/* ------------------------------ MANAGER ----------------------------- */

export function GlobalSheets() {
  const [kind, setKind] = useState<SheetKind | null>(null);
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const courses = useCourses();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "object" && detail?.kind) {
        setKind(detail.kind);
        setPresetDate(detail.date ?? null);
      } else {
        setKind(detail as SheetKind);
        setPresetDate(null);
      }
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  const close = () => setKind(null);

  return (
    <>
      <TaskSheet open={kind === "task"} onClose={close} courses={courses} />
      <CourseSheet open={kind === "course"} onClose={close} />
      <ExamSheet open={kind === "exam"} onClose={close} />
      <ImportSheet open={kind === "import"} onClose={close} />
      <HolidaySheet
        open={kind === "holiday"}
        onClose={close}
        presetDate={presetDate}
      />
      <TopicSheet open={kind === "topic"} onClose={close} courses={courses} />
    </>
  );
}

export const ACTION_ITEMS = [
  { kind: "task" as SheetKind, label: "New reminder", icon: NotebookPen, tint: "#fbbf24" },
  { kind: "import" as SheetKind, label: "Import timetable", icon: FileUp, tint: "#4d9de0" },
  { kind: "exam" as SheetKind, label: "Add exam", icon: BookMarked, tint: "#a293ff" },
  { kind: "holiday" as SheetKind, label: "Mark holiday", icon: Palmtree, tint: "#34d399" },
  { kind: "course" as SheetKind, label: "Add course", icon: GraduationCap, tint: "#fb5c7a" },
  { kind: "topic" as SheetKind, label: "Add topics", icon: ListPlus, tint: "#f97316" },
];
