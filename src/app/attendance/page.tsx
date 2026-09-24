"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  GraduationCap,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Ring } from "@/components/Ring";
import { EmptyState, listItem, listStagger } from "@/components/ui";
import { openSheet, apiSend, useApi, OPEN_EVENT } from "@/lib/useApi";
import { cn, DOW_LABEL, DOW_ORDER, fmtDate, slotTimeLabel, todayKey } from "@/lib/utils";
import type { CourseStat, Summary } from "@/lib/types";
import { AttendanceButtons } from "@/app/page";

function CourseCard({ c, today }: { c: CourseStat; today: string }) {
  const [open, setOpen] = useState(false);
  const safe = c.total === 0 || c.percentage >= c.targetPercent;
  const weekly = DOW_ORDER.map((d) => ({
    day: d,
    slots: c.slots.filter((s) => s.dayOfWeek === d),
  })).filter((g) => g.slots.length > 0);
  const todayTimes = c.todaySlots
    .map(slotTimeLabel)
    .filter(Boolean)
    .join("  ·  ");

  return (
    <motion.div variants={listItem} className="card overflow-hidden">
      <div className="flex items-center gap-3.5 p-4">
        <div className="relative shrink-0">
          <Ring
            value={c.percentage}
            size={52}
            stroke={6}
            from={safe ? c.color : "#fb5c7a"}
            to={safe ? "#34d399" : "#fbbf24"}
          />
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-display text-[11px] font-bold tabular-nums">
              {c.total ? Math.round(c.percentage) : "–"}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{c.name}</p>
          <p className="text-[12px] text-mute">
            {c.code ? `${c.code} · ` : ""}
            {c.present}/{c.total} attended
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="pressable grid size-9 place-items-center rounded-full border border-line bg-white/[0.04] text-mute"
          aria-label="Toggle details"
        >
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="grid place-items-center">
            <ChevronDown size={16} />
          </motion.span>
        </button>
      </div>

      {/* last 14 days strip */}
      <div className="flex items-center gap-1 px-4 pb-3">
        {c.last14.map((d) => (
          <div
            key={d.date}
            className={cn(
              "h-5 flex-1 rounded-[6px]",
              d.status === "present" && "bg-good/70",
              d.status === "absent" && "bg-bad/70",
              d.status === "cancelled" && "bg-white/20",
              !d.status && "bg-white/[0.06]"
            )}
            title={fmtDate(d.date, "d MMM")}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1 text-[11.5px] font-medium">
          {c.total > 0 &&
            (safe ? (
              <span className="flex items-center gap-1.5 text-good">
                <ShieldCheck size={14} className="shrink-0" /> {c.bunk.message}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-bad">
                <ShieldAlert size={14} className="shrink-0" /> {c.bunk.message}
              </span>
            ))}
          {c.meetsToday && todayTimes && (
            <span className="text-[10.5px] font-medium text-faint">
              Today · {todayTimes}
            </span>
          )}
        </div>
        {c.meetsToday ? (
          <AttendanceButtons c={c} today={today} />
        ) : (
          <span className="shrink-0 text-[11px] text-faint">Not today</span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-4 gap-2 border-t border-line p-4">
              {[
                { l: "Present", v: c.present, tint: "#34d399" },
                { l: "Absent", v: c.absent, tint: "#fb5c7a" },
                { l: "Cancelled", v: c.cancelled, tint: "#9aa2b4" },
                { l: "Target", v: `${c.targetPercent}%`, tint: c.color },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-line bg-white/[0.03] px-2 py-2.5 text-center">
                  <p className="font-display text-[16px] font-bold tabular-nums" style={{ color: s.tint }}>
                    {s.v}
                  </p>
                  <p className="text-[10px] font-medium text-faint">{s.l}</p>
                </div>
              ))}
            </div>
            {weekly.length > 0 && (
              <div className="px-4 pb-3.5">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                  Weekly schedule
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {weekly.map((g) => (
                    <span
                      key={g.day}
                      className="rounded-full border border-line bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-mute"
                    >
                      <span className="text-ink">{DOW_LABEL[g.day]}</span>
                      {"  "}
                      {g.slots.map(slotTimeLabel).filter(Boolean).join("  &  ") ||
                        "time varies"}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <p className="truncate text-[12px] text-mute">
                {c.instructor ? `${c.instructor}` : ""}
                {c.location ? ` · ${c.location}` : ""}
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent(OPEN_EVENT, {
                        detail: { kind: "course", courseId: c.id },
                      })
                    )
                  }
                  className="pressable flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.1] px-3 py-1.5 text-[11.5px] font-semibold text-primary2"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Remove ${c.name} and all its data?`))
                      apiSend(`/api/courses/${c.id}`, "DELETE");
                  }}
                  className="pressable flex items-center gap-1.5 rounded-full border border-bad/25 bg-bad/[0.08] px-3 py-1.5 text-[11.5px] font-semibold text-bad"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AttendancePage() {
  const { data, loading } = useApi<Summary>("/api/summary");
  const today = todayKey();

  return (
    <motion.div variants={listStagger} initial="hidden" animate="show">
      <motion.div variants={listItem} className="flex items-end justify-between">
        <div>
          <p className="text-[12.5px] font-medium text-mute">Tap once, done</p>
          <h1 className="font-display text-[26px] font-bold tracking-tight">Attendance</h1>
        </div>
        <button
          onClick={() => openSheet("course")}
          className="pressable rounded-full bg-primary/15 px-4 py-2.5 text-[13px] font-semibold text-primary2"
        >
          + Course
        </button>
      </motion.div>

      {loading || !data ? (
        <div className="mt-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-[24px]" />
          ))}
        </div>
      ) : data.courses.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={GraduationCap}
            title="No courses yet"
            hint="Add your courses with their weekly schedule to start marking in one tap."
            action={
              <button
                onClick={() => openSheet("course")}
                className="pressable rounded-full bg-primary/15 px-4 py-2 text-[13px] font-semibold text-primary2"
              >
                Add course
              </button>
            }
          />
        </div>
      ) : (
        <>
          <motion.div
            variants={listItem}
            className="card mt-6 flex items-center justify-between p-5"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                This semester
              </p>
              <p className="mt-1.5 font-display text-[30px] font-bold tabular-nums leading-none">
                {Math.round(data.overall.percentage)}
                <span className="text-[18px] text-mute">%</span>
              </p>
            </div>
            <div className="space-y-1.5 text-right">
              <p className="text-[12.5px] text-mute">
                <span className="font-semibold text-good">{data.overall.present}</span> attended
              </p>
              <p className="text-[12.5px] text-mute">
                <span className="font-semibold text-bad">{data.overall.total - data.overall.present}</span> missed
              </p>
            </div>
          </motion.div>
          <div className="mt-4 space-y-3">
            {data.courses.map((c) => (
              <CourseCard key={c.id} c={c} today={today} />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
