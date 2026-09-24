"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlarmClockCheck,
  BellRing,
  Check,
  Flame,
  NotebookPen,
  Trash2,
} from "lucide-react";
import { EmptyState, SectionTitle, listItem, listStagger } from "@/components/ui";
import { apiSend, openSheet, useApi } from "@/lib/useApi";
import { cn, relativeDue, todayKey } from "@/lib/utils";
import type { TaskRow } from "@/lib/types";

const FILTERS = [
  { k: "all", l: "All" },
  { k: "assignment", l: "Assignments" },
  { k: "test", l: "Tests & quizzes" },
  { k: "overdue", l: "Overdue" },
  { k: "done", l: "Done" },
] as const;

type Filter = (typeof FILTERS)[number]["k"];

const TYPE_TINT: Record<string, string> = {
  assignment: "#4d9de0",
  test: "#fb5c7a",
  quiz: "#fbbf24",
  lab: "#34d399",
  other: "#a293ff",
};

const PRIORITY_TINT: Record<string, string> = {
  high: "#fb5c7a",
  medium: "#fbbf24",
  low: "#9aa2b4",
};

function TaskCard({ t, today }: { t: TaskRow; today: string }) {
  const done = t.status === "done";
  const overdue = !done && t.dueDate < today;
  const dueToday = !done && t.dueDate === today;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, filter: "blur(3px)", transition: { duration: 0.22 } }}
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      className={cn("card relative overflow-hidden p-4", overdue && "border-bad/30")}
    >
      {overdue && (
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-bad/80 to-transparent" />
      )}
      <div className="flex items-start gap-3">
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={() =>
            apiSend(`/api/tasks/${t.id}`, "PATCH", {
              status: done ? "pending" : "done",
            })
          }
          aria-label={done ? "Reopen" : "Complete"}
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
            done ? "border-good bg-good text-bg" : "border-white/25 text-transparent hover:border-good/60"
          )}
        >
          <motion.span
            initial={false}
            animate={{ scale: done ? 1 : 0.4, opacity: done ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
          >
            <Check size={15} strokeWidth={3.2} />
          </motion.span>
        </motion.button>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[14.5px] font-semibold leading-snug transition-colors",
              done && "text-faint line-through decoration-white/30"
            )}
          >
            {t.title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider"
              style={{ background: `${TYPE_TINT[t.type]}1f`, color: TYPE_TINT[t.type] }}
            >
              {t.type}
            </span>
            {t.courseName && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-[3px] text-[10.5px] font-medium text-mute">
                <span className="size-1.5 rounded-full" style={{ background: t.courseColor ?? "#888" }} />
                {t.courseName}
              </span>
            )}
            <span
              className="flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-semibold"
              style={{ color: PRIORITY_TINT[t.priority], background: `${PRIORITY_TINT[t.priority]}14` }}
            >
              <Flame size={10} />
              {t.priority}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={cn(
              "text-[11.5px] font-bold",
              done ? "text-faint" : overdue ? "text-bad" : dueToday ? "text-warn" : "text-primary2"
            )}
          >
            {done ? "Completed" : relativeDue(t.dueDate)}
          </span>
          {t.dueTime && !done && (
            <span className="text-[10.5px] text-faint">{t.dueTime}</span>
          )}
          <button
            onClick={() => apiSend(`/api/tasks/${t.id}`, "DELETE")}
            className="pressable grid size-7 place-items-center rounded-full text-faint hover:text-bad"
            aria-label="Delete task"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {t.notes && !done && (
        <p className="mt-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-mute">
          {t.notes}
        </p>
      )}
    </motion.div>
  );
}

export default function PlannerPage() {
  const { data, loading } = useApi<TaskRow[]>("/api/tasks");
  const [filter, setFilter] = useState<Filter>("all");
  const today = todayKey();

  const filtered = useMemo(() => {
    if (!data) return [];
    switch (filter) {
      case "assignment":
        return data.filter((t) => t.status === "pending" && (t.type === "assignment" || t.type === "lab" || t.type === "other"));
      case "test":
        return data.filter((t) => t.status === "pending" && (t.type === "test" || t.type === "quiz"));
      case "overdue":
        return data.filter((t) => t.status === "pending" && t.dueDate < today);
      case "done":
        return data.filter((t) => t.status === "done");
      default:
        return [...data].sort((a, b) => {
          if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
          return a.dueDate.localeCompare(b.dueDate);
        });
    }
  }, [data, filter, today]);

  const reminders = useMemo(
    () =>
      (data ?? []).filter((t) => {
        if (t.status !== "pending") return false;
        const diff = Math.round(
          (new Date(t.dueDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000
        );
        return diff >= 0 && diff <= (t.remindDaysBefore ?? 1);
      }),
    [data, today]
  );

  return (
    <motion.div variants={listStagger} initial="hidden" animate="show">
      <motion.div variants={listItem} className="flex items-end justify-between">
        <div>
          <p className="text-[12.5px] font-medium text-mute">
            {data ? `${data.filter((t) => t.status === "pending").length} open` : ""}
          </p>
          <h1 className="font-display text-[26px] font-bold tracking-tight">Planner</h1>
        </div>
        <button
          onClick={() => openSheet("task")}
          className="pressable rounded-full bg-primary/15 px-4 py-2.5 text-[13px] font-semibold text-primary2"
        >
          + Reminder
        </button>
      </motion.div>

      {/* reminder banner */}
      {reminders.length > 0 && (
        <motion.div
          variants={listItem}
          className="mt-5 rounded-[22px] border border-warn/25 bg-gradient-to-br from-warn/[0.13] to-transparent p-4"
        >
          <div className="flex items-center gap-2 text-warn">
            <BellRing size={15} />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Reminder window</p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {reminders.slice(0, 3).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="truncate font-medium">{r.title}</span>
                <span className={cn("shrink-0 font-semibold", r.dueDate === today ? "text-warn" : "text-mute")}>
                  {relativeDue(r.dueDate)}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* filters */}
      <motion.div variants={listItem} className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1">
        {FILTERS.map((f) => {
          const active = filter === f.k;
          return (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={cn(
                "pressable relative shrink-0 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors",
                active ? "text-white" : "text-mute"
              )}
            >
              {active && (
                <motion.span
                  layoutId="planner-chip"
                  className={cn(
                    "absolute inset-0 rounded-full",
                    f.k === "overdue" ? "bg-bad/80" : "bg-primary/80"
                  )}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{f.l}</span>
            </button>
          );
        })}
      </motion.div>

      {/* list */}
      <SectionTitle>{filter === "done" ? "Completed" : "Tasks"}</SectionTitle>
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-[24px]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={filter === "done" ? Check : filter === "overdue" ? Flame : NotebookPen}
          title={
            filter === "done"
              ? "Nothing completed yet"
              : filter === "overdue"
              ? "Zero backlogs"
              : "All clear"
          }
          hint={
            filter === "overdue"
              ? "Nothing is past due. Keep the streak alive."
              : filter === "done"
              ? "Tick off a task and it will show up here."
              : "Add an assignment or a test reminder to get started."
          }
          action={
            filter === "all" || filter === "assignment" || filter === "test" ? (
              <button
                onClick={() => openSheet("task")}
                className="pressable rounded-full bg-primary/15 px-4 py-2 text-[13px] font-semibold text-primary2"
              >
                New reminder
              </button>
            ) : undefined
          }
        />
      ) : (
        <motion.div layout className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((t) => (
              <TaskCard key={t.id} t={t} today={today} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {filter !== "done" && (data ?? []).some((t) => t.status === "done") && (
        <button
          onClick={() => setFilter("done")}
          className="pressable mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white/[0.03] py-3 text-[13px] font-semibold text-mute"
        >
          <AlarmClockCheck size={15} />
          View {(data ?? []).filter((t) => t.status === "done").length} completed
        </button>
      )}
    </motion.div>
  );
}
