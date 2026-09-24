"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookMarked,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileUp,
  MapPin,
  NotebookPen,
  Palmtree,
  Plus,
  Trash2,
} from "lucide-react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { EmptyState, SectionTitle, listItem, listStagger } from "@/components/ui";
import { REFRESH_EVENT, apiSend, openSheet } from "@/lib/useApi";
import { cn, fmtDate, todayKey } from "@/lib/utils";
import type { ExamRow, HolidayRow, TaskRow } from "@/lib/types";

type CalData = { exams: ExamRow[]; holidays: HolidayRow[]; tasks: TaskRow[] };

function useCalendarData() {
  const [data, setData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const [exams, holidays, tasks] = await Promise.all([
        fetch("/api/exams", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/holidays", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/tasks", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setData({ exams, holidays, tasks });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(REFRESH_EVENT, load);
    return () => window.removeEventListener(REFRESH_EVENT, load);
  }, [load]);
  return { data, loading };
}

const DAY_HEAD = ["S", "M", "T", "W", "T", "F", "S"];

export default function CalendarPage() {
  const { data, loading } = useCalendarData();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [dir, setDir] = useState(0);
  const [selected, setSelected] = useState(todayKey());
  const today = todayKey();

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const rows: Date[] = [];
    let d = start;
    const end = endOfWeek(endOfMonth(cursor));
    while (d <= end) {
      rows.push(d);
      d = addDays(d, 1);
    }
    return rows;
  }, [cursor]);

  // day → content maps
  const examMap = useMemo(() => {
    const m = new Map<string, ExamRow[]>();
    for (const e of data?.exams ?? []) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [data]);

  const taskMap = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of data?.tasks ?? []) {
      if (t.status === "done") continue;
      const arr = m.get(t.dueDate) ?? [];
      arr.push(t);
      m.set(t.dueDate, arr);
    }
    return m;
  }, [data]);

  const holidayMap = useMemo(() => {
    const m = new Map<string, HolidayRow>();
    for (const h of data?.holidays ?? []) {
      let d = parseISO(h.startDate);
      const end = parseISO(h.endDate);
      let guard = 0;
      while (d <= end && guard < 62) {
        m.set(format(d, "yyyy-MM-dd"), h);
        d = addDays(d, 1);
        guard++;
      }
    }
    return m;
  }, [data]);

  const nav = (delta: number) => {
    setDir(delta);
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  };

  const selExams = examMap.get(selected) ?? [];
  const selTasks = taskMap.get(selected) ?? [];
  const selHoliday = holidayMap.get(selected);

  const upcoming = (data?.exams ?? []).filter((e) => e.date >= today);

  return (
    <motion.div variants={listStagger} initial="hidden" animate="show">
      <motion.div variants={listItem} className="flex items-end justify-between">
        <div>
          <p className="text-[12.5px] font-medium text-mute">Auto-built from your timetable</p>
          <h1 className="font-display text-[26px] font-bold tracking-tight">Calendar</h1>
        </div>
        <button
          onClick={() => openSheet("import")}
          className="pressable flex items-center gap-1.5 rounded-full bg-primary/15 px-4 py-2.5 text-[13px] font-semibold text-primary2"
        >
          <FileUp size={15} /> Import
        </button>
      </motion.div>

      {/* month card */}
      <motion.div variants={listItem} className="card mt-6 overflow-hidden p-4">
        <div className="flex items-center justify-between px-1 pb-3">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h2
              key={format(cursor, "yyyy-MM")}
              initial={{ opacity: 0, x: dir * 26 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -26 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[19px] font-bold tracking-tight"
            >
              {format(cursor, "MMMM")}{" "}
              <span className="text-mute">{format(cursor, "yyyy")}</span>
            </motion.h2>
          </AnimatePresence>
          <div className="flex gap-2">
            <button
              onClick={() => nav(-1)}
              className="pressable grid size-9 place-items-center rounded-full border border-line bg-white/[0.04] text-mute"
              aria-label="Previous month"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              onClick={() => nav(1)}
              className="pressable grid size-9 place-items-center rounded-full border border-line bg-white/[0.04] text-mute"
              aria-label="Next month"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAY_HEAD.map((d, i) => (
            <div key={i} className="pb-1 text-center text-[10.5px] font-bold text-faint">
              {d}
            </div>
          ))}
          {loading
            ? [...Array(35)].map((_, i) => (
                <div key={i} className="skeleton aspect-square rounded-xl" />
              ))
            : days.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const inMonth = isSameMonth(d, cursor);
                const isToday = key === today;
                const isSel = key === selected;
                const hasExam = examMap.has(key);
                const hasTask = taskMap.has(key);
                const hasHol = holidayMap.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    className={cn(
                      "pressable relative aspect-square rounded-xl transition-colors",
                      isSel
                        ? "bg-primary text-white shadow-[0_8px_20px_-6px_#7b6cffaa]"
                        : isToday
                        ? "ring-1 ring-inset ring-primary/70"
                        : hasHol
                        ? "bg-good/[0.08]"
                        : "",
                      !inMonth && "opacity-25"
                    )}
                  >
                    <span
                      className={cn(
                        "font-display text-[13.5px] font-semibold tabular-nums",
                        isSel ? "text-white" : isToday ? "text-primary2" : "text-ink/90"
                      )}
                    >
                      {format(d, "d")}
                    </span>
                    <span className="absolute inset-x-0 bottom-[7px] flex justify-center gap-[3px]">
                      {hasHol && <span className={cn("size-[5px] rounded-full", isSel ? "bg-white" : "bg-good")} />}
                      {hasExam && <span className={cn("size-[5px] rounded-full", isSel ? "bg-white" : "bg-primary2")} />}
                      {hasTask && <span className={cn("size-[5px] rounded-full", isSel ? "bg-white" : "bg-warn")} />}
                    </span>
                  </button>
                );
              })}
        </div>

        {/* legend */}
        <div className="mt-3 flex items-center gap-4 px-1 pt-1 text-[11px] font-medium text-mute">
          <span className="flex items-center gap-1.5"><span className="size-[7px] rounded-full bg-primary2" /> Exam</span>
          <span className="flex items-center gap-1.5"><span className="size-[7px] rounded-full bg-warn" /> Due</span>
          <span className="flex items-center gap-1.5"><span className="size-[7px] rounded-full bg-good" /> Holiday</span>
        </div>
      </motion.div>

      {/* selected day agenda */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="card mt-4 p-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-display text-[15px] font-semibold">
              {fmtDate(selected, "EEEE, d MMMM")}
            </p>
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("sf:open", { detail: { kind: "holiday", date: selected } })
                )
              }
              className="pressable flex items-center gap-1.5 rounded-full border border-good/30 bg-good/10 px-3 py-1.5 text-[11.5px] font-semibold text-good"
            >
              <Palmtree size={12} /> Mark holiday
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {selHoliday && (
              <div className="flex items-center gap-3 rounded-2xl bg-good/[0.09] px-3.5 py-3">
                <Palmtree size={16} className="shrink-0 text-good" />
                <p className="text-[13.5px] font-semibold">{selHoliday.title}</p>
              </div>
            )}
            {selExams.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-2xl bg-primary/[0.09] px-3.5 py-3">
                <BookMarked size={16} className="shrink-0 text-primary2" />
                <div>
                  <p className="text-[13.5px] font-semibold">{e.subject}</p>
                  <p className="text-[11.5px] text-mute">
                    {[e.startTime, e.venue].filter(Boolean).join(" · ") || "Exam"}
                  </p>
                </div>
              </div>
            ))}
            {selTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-warn/[0.08] px-3.5 py-3">
                <NotebookPen size={16} className="shrink-0 text-warn" />
                <div>
                  <p className="text-[13px] font-semibold">{t.title}</p>
                  <p className="text-[11.5px] capitalize text-mute">{t.type} due</p>
                </div>
              </div>
            ))}
            {!selHoliday && selExams.length === 0 && selTasks.length === 0 && (
              <p className="py-2 text-center text-[12.5px] text-faint">
                Nothing on this day — light and easy.
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* exam timetable */}
      <SectionTitle
        right={
          <button
            onClick={() => openSheet("exam")}
            className="flex items-center gap-1 text-[12.5px] font-semibold text-primary2"
          >
            <Plus size={14} /> Add exam
          </button>
        }
      >
        Exam timetable
      </SectionTitle>
      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-[24px]" />
          ))}
        </div>
      ) : (data?.exams ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No exams on the calendar"
          hint="Paste or upload your exam timetable and the calendar fills itself."
          action={
            <button
              onClick={() => openSheet("import")}
              className="pressable rounded-full bg-primary/15 px-4 py-2 text-[13px] font-semibold text-primary2"
            >
              Import timetable
            </button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {upcoming.map((e) => {
            const dLeft = Math.round(
              (new Date(e.date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000
            );
            return (
              <motion.div key={e.id} variants={listItem} className="card flex items-center gap-3.5 p-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/[0.09]">
                  <div className="text-center leading-none">
                    <p className="font-display text-[16px] font-bold text-primary2">
                      {format(parseISO(e.date), "d")}
                    </p>
                    <p className="text-[8.5px] font-bold uppercase text-primary2/70">
                      {format(parseISO(e.date), "MMM")}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{e.subject}</p>
                  <p className="flex items-center gap-1 text-[11.5px] text-mute">
                    {e.startTime && <span>{e.startTime}{e.endTime ? `–${e.endTime}` : ""}</span>}
                    {e.venue && (
                      <span className="flex items-center gap-0.5"><MapPin size={10} />{e.venue}</span>
                    )}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums",
                    dLeft <= 3 ? "bg-bad/15 text-bad" : dLeft <= 7 ? "bg-warn/15 text-warn" : "bg-white/[0.06] text-mute"
                  )}
                >
                  {dLeft === 0 ? "Today" : `${dLeft}d`}
                </span>
                <button
                  onClick={() => apiSend(`/api/exams/${e.id}`, "DELETE")}
                  className="pressable grid size-8 place-items-center rounded-full text-faint hover:text-bad"
                  aria-label="Delete exam"
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* holidays */}
      <SectionTitle>Holidays & breaks</SectionTitle>
      {loading ? null : (data?.holidays ?? []).length === 0 ? (
        <EmptyState
          icon={Palmtree}
          title="No holidays marked"
          hint="Mark institute holidays and personal days so attendance pauses."
          action={
            <button
              onClick={() => openSheet("holiday")}
              className="pressable rounded-full bg-good/15 px-4 py-2 text-[13px] font-semibold text-good"
            >
              Mark holiday
            </button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {(data?.holidays ?? []).map((h) => (
            <motion.div key={h.id} variants={listItem} className="card flex items-center gap-3.5 p-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-good/[0.12] text-good">
                <Palmtree size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">{h.title}</p>
                <p className="text-[11.5px] capitalize text-mute">
                  {fmtDate(h.startDate, "d MMM")}
                  {h.endDate !== h.startDate && ` → ${fmtDate(h.endDate, "d MMM")}`} · {h.kind}
                </p>
              </div>
              <button
                onClick={() => apiSend(`/api/holidays/${h.id}`, "DELETE")}
                className="pressable grid size-8 place-items-center rounded-full text-faint hover:text-bad"
                aria-label="Remove holiday"
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
