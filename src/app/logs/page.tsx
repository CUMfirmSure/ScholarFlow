"use client";

import { useState } from "react";
import Link from "@/compat/next-link";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  BookMarked,
  Check,
  CircleAlert,
  ClipboardList,
  Flame,
  GraduationCap,
  History,
  ListChecks,
  Palmtree,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { EmptyState, listItem, listStagger } from "@/components/ui";
import { useApi, openSheet } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import type { LogRow, Summary } from "@/lib/types";

const ENTITY_META: Record<string, { icon: typeof GraduationCap; tint: string }> = {
  course: { icon: GraduationCap, tint: "#7b6cff" },
  task: { icon: ClipboardList, tint: "#fbbf24" },
  exam: { icon: BookMarked, tint: "#a293ff" },
  holiday: { icon: Palmtree, tint: "#34d399" },
  syllabus: { icon: ListChecks, tint: "#4d9de0" },
  attendance: { icon: UserCheck, tint: "#34d399" },
};

export default function LogsPage() {
  const { data: logs, loading } = useApi<LogRow[]>("/api/logs");
  const { data: summary } = useApi<Summary>("/api/summary");
  const [tab, setTab] = useState<"activity" | "backlogs">("activity");

  const overdue = summary?.overdueTasks ?? [];
  const risk = summary?.backlogs.riskCourses ?? [];
  const backlogCount = overdue.length + risk.length + (summary?.backlogs.pendingTopics ?? 0);

  return (
    <motion.div variants={listStagger} initial="hidden" animate="show">
      <motion.div variants={listItem}>
        <p className="text-[12.5px] font-medium text-mute">Your trail, timestamped</p>
        <h1 className="font-display text-[26px] font-bold tracking-tight">
          Logs <span className="text-gradient">&</span> Backlogs
        </h1>
      </motion.div>

      {/* tabs */}
      <motion.div variants={listItem} className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-line bg-white/[0.03] p-1">
        {(["activity", "backlogs"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "pressable relative rounded-full py-2.5 text-[13.5px] font-semibold capitalize transition-colors",
                active ? "text-white" : "text-mute"
              )}
            >
              {active && (
                <motion.span
                  layoutId="logs-tab"
                  className={cn("absolute inset-0 rounded-full", t === "backlogs" ? "bg-bad/80" : "bg-primary/80")}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative flex items-center justify-center gap-1.5">
                {t}
                {t === "backlogs" && backlogCount > 0 && (
                  <span className={cn("grid size-5 place-items-center rounded-full text-[10px] font-bold", active ? "bg-white/25 text-white" : "bg-bad/20 text-bad")}>
                    {backlogCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </motion.div>

      {tab === "activity" ? (
        <div className="relative mt-6">
          <div className="absolute left-[19px] top-2 bottom-6 w-px bg-gradient-to-b from-white/15 to-transparent" />
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton ml-12 h-14 rounded-2xl" />
              ))}
            </div>
          ) : (logs ?? []).length === 0 ? (
            <EmptyState
              icon={History}
              title="No activity yet"
              hint="Everything you do — marks, completions, imports — gets logged here."
            />
          ) : (
            <motion.div variants={listStagger} initial="hidden" animate="show" className="space-y-4">
              {(logs ?? []).map((l) => {
                const meta = ENTITY_META[l.entity] ?? { icon: Sparkles, tint: "#9aa2b4" };
                const Icon = meta.icon;
                return (
                  <motion.div key={l.id} variants={listItem} className="relative flex gap-3.5">
                    <div
                      className="z-10 grid size-10 shrink-0 place-items-center rounded-full border border-line"
                      style={{ background: `${meta.tint}1a`, color: meta.tint }}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-[13.5px] leading-snug font-medium">{l.detail}</p>
                      <p className="mt-1 text-[11px] font-medium text-faint">
                        {formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      ) : (
        <motion.div
          key="backlogs"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-6 space-y-6"
        >
          {/* overdue tasks */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Flame size={15} className="text-bad" />
              <h2 className="font-display text-[15px] font-semibold">Overdue tasks</h2>
              <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[11px] font-bold text-bad">
                {overdue.length}
              </span>
            </div>
            {overdue.length === 0 ? (
              <p className="rounded-2xl border border-line bg-white/[0.02] px-4 py-4 text-[13px] text-mute">
                Nothing past due. Textbook discipline.
              </p>
            ) : (
              <div className="space-y-2">
                {overdue.map((t) => (
                  <div key={t.id} className="card flex items-center gap-3 border-bad/25 p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold">{t.title}</p>
                      <p className="text-[11.5px] capitalize text-bad">
                        {t.type} · was due {t.dueDate}
                      </p>
                    </div>
                    <Link
                      href="/planner"
                      className="pressable shrink-0 rounded-full bg-bad/15 px-3 py-1.5 text-[11.5px] font-semibold text-bad"
                    >
                      Clear
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* attendance risk */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert size={15} className="text-warn" />
              <h2 className="font-display text-[15px] font-semibold">Attendance at risk</h2>
              <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-bold text-warn">
                {risk.length}
              </span>
            </div>
            {risk.length === 0 ? (
              <p className="rounded-2xl border border-line bg-white/[0.02] px-4 py-4 text-[13px] text-mute">
                Every course is above its target. Solid.
              </p>
            ) : (
              <div className="space-y-2">
                {risk.map((r) => (
                  <div key={r.id} className="card flex items-center gap-3 border-warn/20 p-3.5">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold">{r.name}</p>
                      <p className="text-[11.5px] text-warn">
                        {Math.round(r.percentage)}% vs {r.targetPercent}% — {r.message}
                      </p>
                    </div>
                    <Link
                      href="/attendance"
                      className="pressable shrink-0 rounded-full bg-warn/15 px-3 py-1.5 text-[11.5px] font-semibold text-warn"
                    >
                      Fix
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* syllabus pending */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <CircleAlert size={15} className="text-primary2" />
              <h2 className="font-display text-[15px] font-semibold">Unfinished topics</h2>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary2">
                {summary?.backlogs.pendingTopics ?? 0}
              </span>
            </div>
            <div className="card flex items-center justify-between p-4">
              <p className="text-[13px] text-mute">
                {summary?.backlogs.pendingTopics
                  ? `${summary.backlogs.pendingTopics} topics still pending or in revision across your courses.`
                  : "The syllabus is fully green. Remarkable."}
              </p>
              <Link
                href="/syllabus"
                className="pressable shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-[11.5px] font-semibold text-primary2"
              >
                Review
              </Link>
            </div>
          </section>

          {backlogCount === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-good/15 text-good">
                <Check size={22} strokeWidth={2.6} />
              </span>
              <p className="font-display text-[16px] font-semibold">Zero backlogs</p>
              <p className="max-w-[240px] text-[12.5px] text-mute">
                Everything is caught up. Add a new target to keep the momentum.
              </p>
              <button
                onClick={() => openSheet("task")}
                className="pressable mt-1 rounded-full bg-primary/15 px-4 py-2 text-[13px] font-semibold text-primary2"
              >
                Plan something
              </button>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
