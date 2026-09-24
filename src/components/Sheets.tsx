"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import type { CourseRow, SlotRow } from "@/lib/types";
import {
  BookMarked,
  Copy,
  FileUp,
  GraduationCap,
  ListPlus,
  NotebookPen,
  Palmtree,
  Plus,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */

const DOWS = [
  { k: "mon", l: "M", label: "Monday" },
  { k: "tue", l: "T", label: "Tuesday" },
  { k: "wed", l: "W", label: "Wednesday" },
  { k: "thu", l: "T", label: "Thursday" },
  { k: "fri", l: "F", label: "Friday" },
  { k: "sat", l: "S", label: "Saturday" },
  { k: "sun", l: "S", label: "Sunday" },
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

type DayState = { enabled: boolean; slots: { start: string; end: string }[] };
type WeekState = Record<string, DayState>;

const emptyWeek = (): WeekState =>
  Object.fromEntries(
    DOWS.map((d) => [
      d.k,
      { enabled: false, slots: [{ start: "", end: "" }] },
    ])
  );

function CourseSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: (CourseRow & { slots?: SlotRow[] }) | null;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [instructor, setInstructor] = useState("");
  const [location, setLocation] = useState("");
  const [week, setWeek] = useState<WeekState>(emptyWeek());
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [target, setTarget] = useState("75");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setCode(editing.code ?? "");
      setInstructor(editing.instructor ?? "");
      setLocation(editing.location ?? "");
      setColor(editing.color || COURSE_COLORS[0]);
      setTarget(String(editing.targetPercent ?? 75));
      const w = emptyWeek();
      for (const s of editing.slots ?? []) {
        const day = w[s.dayOfWeek];
        if (!day) continue;
        day.enabled = true;
        day.slots.push({ start: s.startTime ?? "", end: s.endTime ?? "" });
      }
      for (const k of Object.keys(w)) {
        if (w[k].slots.length > 1) w[k].slots = w[k].slots.slice(1);
      }
      setWeek(w);
    } else {
      setName(""); setCode(""); setInstructor(""); setLocation("");
      setWeek(emptyWeek());
      setColor(COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)]);
      setTarget("75");
    }
  }, [open, editing]);

  const toggleDay = (k: string) =>
    setWeek((w) => ({ ...w, [k]: { ...w[k], enabled: !w[k].enabled } }));

  const setSlot = (k: string, i: number, field: "start" | "end", v: string) =>
    setWeek((w) => {
      const slots = w[k].slots.map((s, j) => (j === i ? { ...s, [field]: v } : s));
      return { ...w, [k]: { ...w[k], slots } };
    });

  const addSlot = (k: string) =>
    setWeek((w) =>
      w[k].slots.length >= 3
        ? w
        : { ...w, [k]: { ...w[k], slots: [...w[k].slots, { start: "", end: "" }] } }
    );

  const removeSlot = (k: string, i: number) =>
    setWeek((w) => {
      const slots = w[k].slots.filter((_, j) => j !== i);
      return { ...w, [k]: { ...w[k], slots: slots.length ? slots : [{ start: "", end: "" }] } };
    });

  const applyToAll = (k: string) =>
    setWeek((w) => {
      const src = w[k].slots[0];
      const next: WeekState = {};
      for (const key of Object.keys(w)) {
        next[key] = w[key].enabled ? { ...w[key], slots: [{ ...src }] } : w[key];
      }
      return next;
    });

  const enabledDays = DOWS.filter((d) => week[d.k]?.enabled);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    const slots = enabledDays.flatMap((d) =>
      week[d.k].slots.map((s) => ({
        dayOfWeek: d.k,
        startTime: s.start,
        endTime: s.end,
      }))
    );
    const payload = {
      name, code, instructor, location, slots, color,
      targetPercent: Number(target) || 75,
    };
    if (editing) await apiSend(`/api/courses/${editing.id}`, "PATCH", payload);
    else await apiSend("/api/courses", "POST", payload);
    setBusy(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit course" : "Add course"}
      subtitle="Every day can carry its own time"
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

        <div>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
            Weekly schedule
          </span>
          <div className="mb-3 flex gap-1.5">
            {DOWS.map((d) => {
              const active = week[d.k]?.enabled;
              return (
                <button
                  key={d.k}
                  type="button"
                  onClick={() => toggleDay(d.k)}
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

          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {enabledDays.map((d) => (
                <motion.div
                  key={d.k}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="rounded-2xl border border-line bg-white/[0.03] p-2.5">
                    {week[d.k].slots.map((s, i) => (
                      <div key={i} className={cn("flex items-center gap-2", i > 0 && "mt-2")}>
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold",
                            i === 0 ? "bg-primary/15 text-primary2" : "bg-white/[0.06] text-faint"
                          )}
                        >
                          {i === 0 ? d.l : i + 1}
                        </span>
                        <input
                          type="time"
                          aria-label={`${d.l} start`}
                          className="min-w-0 flex-1 rounded-xl border border-line bg-white/[0.04] px-2.5 py-2 text-[13px] text-ink outline-none focus:border-primary/60"
                          value={s.start}
                          onChange={(e) => setSlot(d.k, i, "start", e.target.value)}
                        />
                        <span className="shrink-0 text-[11px] text-faint">to</span>
                        <input
                          type="time"
                          aria-label={`${d.l} end`}
                          className="min-w-0 flex-1 rounded-xl border border-line bg-white/[0.04] px-2.5 py-2 text-[13px] text-ink outline-none focus:border-primary/60"
                          value={s.end}
                          onChange={(e) => setSlot(d.k, i, "end", e.target.value)}
                        />
                        {i === 0 ? (
                          <button
                            type="button"
                            onClick={() => applyToAll(d.k)}
                            title="Copy this time to all selected days"
                            className="pressable grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white/[0.04] text-mute hover:text-primary2"
                          >
                            <Copy size={13} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeSlot(d.k, i)}
                            title="Remove slot"
                            className="pressable grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white/[0.04] text-mute hover:text-bad"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    {week[d.k].slots.length < 3 && (
                      <button
                        type="button"
                        onClick={() => addSlot(d.k)}
                        className="pressable mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-1.5 text-[11px] font-semibold text-faint hover:text-mute"
                      >
                        <Plus size={12} /> another time on {d.label}
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {enabledDays.length === 0 && (
              <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-center text-[12px] text-faint">
                Pick the days this course meets, then set each day&apos;s time.
              </p>
            )}
          </div>
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
          {editing ? "Save changes" : "Add course"}
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
  const [editCourseId, setEditCourseId] = useState<number | null>(null);
  const courses = useCourses();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "object" && detail?.kind) {
        setKind(detail.kind);
        setPresetDate(detail.date ?? null);
        setEditCourseId(detail.courseId ?? null);
      } else {
        setKind(detail as SheetKind);
        setPresetDate(null);
        setEditCourseId(null);
      }
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  const close = () => setKind(null);
  const editing = courses.find((c) => c.id === editCourseId) ?? null;

  return (
    <>
      <TaskSheet open={kind === "task"} onClose={close} courses={courses} />
      <CourseSheet open={kind === "course"} onClose={close} editing={editing} />
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
