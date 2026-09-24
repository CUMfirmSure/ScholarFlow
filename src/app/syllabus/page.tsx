"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleDashed,
  ListPlus,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { EmptyState, listItem, listStagger } from "@/components/ui";
import { REFRESH_EVENT, apiSend, openSheet } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import type { CourseRow, SyllabusRow } from "@/lib/types";

function useSyllabus() {
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [topics, setTopics] = useState<SyllabusRow[] | null>(null);
  const load = useCallback(async () => {
    const [c, t] = await Promise.all([
      fetch("/api/courses", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/syllabus", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setCourses(c);
    setTopics(t);
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(REFRESH_EVENT, load);
    return () => window.removeEventListener(REFRESH_EVENT, load);
  }, [load]);
  return { courses, topics, loading: !courses || !topics };
}

function StatusIcon({ status }: { status: SyllabusRow["status"] }) {
  if (status === "done")
    return (
      <span className="grid size-6 place-items-center rounded-full bg-good text-bg">
        <Check size={14} strokeWidth={3.2} />
      </span>
    );
  if (status === "in_progress")
    return (
      <span className="grid size-6 place-items-center rounded-full border-2 border-warn text-warn">
        <LoaderCircle size={13} strokeWidth={2.6} />
      </span>
    );
  return (
    <span className="grid size-6 place-items-center rounded-full border-2 border-white/20 text-faint">
      <CircleDashed size={13} />
    </span>
  );
}

function CourseAccordion({
  course,
  topics,
  defaultOpen,
}: {
  course: CourseRow;
  topics: SyllabusRow[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const done = topics.filter((t) => t.status === "done").length;
  const value = topics.length ? Math.round((done / topics.length) * 100) : 0;

  const units = useMemo(() => {
    const m = new Map<string, SyllabusRow[]>();
    for (const t of topics) {
      const arr = m.get(t.unit) ?? [];
      arr.push(t);
      m.set(t.unit, arr);
    }
    return [...m.entries()];
  }, [topics]);

  const cycle = (t: SyllabusRow) => {
    const next =
      t.status === "pending" ? "in_progress" : t.status === "in_progress" ? "done" : "pending";
    apiSend(`/api/syllabus/${t.id}`, "PATCH", { status: next });
  };

  return (
    <motion.div variants={listItem} className="card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="pressable w-full p-4 text-left">
        <div className="flex items-center gap-3">
          <div
            className="grid size-11 shrink-0 place-items-center rounded-2xl"
            style={{ background: `${course.color}1f`, color: course.color }}
          >
            <BookOpen size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-[14.5px] font-semibold">{course.name}</p>
              <span className="shrink-0 font-display text-[13px] font-bold tabular-nums" style={{ color: course.color }}>
                {value}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{ background: course.color }}
              />
            </div>
          </div>
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="grid shrink-0 place-items-center text-faint">
            <ChevronDown size={17} />
          </motion.span>
        </div>
        <p className="mt-2 pl-14 text-[11.5px] text-mute">
          {done}/{topics.length} topics finished
        </p>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-line p-4">
              {units.map(([unit, ts]) => {
                const uDone = ts.filter((t) => t.status === "done").length;
                return (
                  <div key={unit}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-faint">
                        {unit}
                      </p>
                      <p className="text-[10.5px] font-semibold tabular-nums text-faint">
                        {uDone}/{ts.length}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {ts.map((t) => (
                        <div
                          key={t.id}
                          className={cn(
                            "group flex items-center gap-3 rounded-2xl border border-line bg-white/[0.02] px-3 py-2.5",
                            t.status === "done" && "opacity-55"
                          )}
                        >
                          <button onClick={() => cycle(t)} className="pressable shrink-0" aria-label="Cycle status">
                            <StatusIcon status={t.status} />
                          </button>
                          <p
                            className={cn(
                              "min-w-0 flex-1 text-[13.5px] font-medium",
                              t.status === "done" && "line-through decoration-white/30"
                            )}
                          >
                            {t.topic}
                          </p>
                          {t.status === "in_progress" && (
                            <span className="shrink-0 rounded-full bg-warn/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-warn">
                              revising
                            </span>
                          )}
                          <button
                            onClick={() => apiSend(`/api/syllabus/${t.id}`, "DELETE")}
                            className="pressable shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad"
                            aria-label="Delete topic"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => openSheet("topic")}
                className="pressable flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-[12.5px] font-semibold text-mute"
              >
                <ListPlus size={15} /> Add topics to this course
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function SyllabusPage() {
  const { courses, topics, loading } = useSyllabus();

  const grouped = useMemo(() => {
    const m = new Map<number, SyllabusRow[]>();
    for (const t of topics ?? []) {
      const arr = m.get(t.courseId) ?? [];
      arr.push(t);
      m.set(t.courseId, arr);
    }
    return m;
  }, [topics]);

  const totalDone = (topics ?? []).filter((t) => t.status === "done").length;
  const totalAll = (topics ?? []).length;

  return (
    <motion.div variants={listStagger} initial="hidden" animate="show">
      <motion.div variants={listItem} className="flex items-end justify-between">
        <div>
          <p className="text-[12.5px] font-medium text-mute">
            {totalAll ? `${totalDone} of ${totalAll} topics done` : "Unit by unit"}
          </p>
          <h1 className="font-display text-[26px] font-bold tracking-tight">Syllabus</h1>
        </div>
        <button
          onClick={() => openSheet("topic")}
          className="pressable rounded-full bg-primary/15 px-4 py-2.5 text-[13px] font-semibold text-primary2"
        >
          + Topics
        </button>
      </motion.div>

      {totalAll > 0 && (
        <motion.div variants={listItem} className="card mt-6 p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
              Semester coverage
            </p>
            <p className="font-display text-[22px] font-bold tabular-nums">
              {Math.round((totalDone / totalAll) * 100)}%
            </p>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(totalDone / totalAll) * 100}%` }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary2"
            />
          </div>
          <p className="mt-2.5 text-[12px] text-mute">
            {(topics ?? []).filter((t) => t.status === "in_progress").length} topics currently in revision
          </p>
        </motion.div>
      )}

      <div className="mt-5 space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-[24px]" />)
        ) : (courses ?? []).length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Add a course first"
            hint="Syllabus topics attach to courses — add one to begin."
            action={
              <button
                onClick={() => openSheet("course")}
                className="pressable rounded-full bg-primary/15 px-4 py-2 text-[13px] font-semibold text-primary2"
              >
                Add course
              </button>
            }
          />
        ) : (
          (courses ?? []).map((c, i) => (
            <CourseAccordion
              key={c.id}
              course={c}
              topics={grouped.get(c.id) ?? []}
              defaultOpen={i === 0}
            />
          ))
        )}
      </div>

      <motion.p variants={listItem} className="mt-5 text-center text-[11.5px] text-faint">
        Tap a circle to cycle: pending → revising → done
      </motion.p>
    </motion.div>
  );
}
