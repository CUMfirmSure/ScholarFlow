"use client";

import Link from "@/compat/next-link";
import { motion } from "framer-motion";
import {
  AlarmClockCheck,
  ArrowUpRight,
  BellRing,
  BookOpen,
  CalendarClock,
  Check,
  Flame,
  GraduationCap,
  History,
  Minus,
  Palmtree,
  Sparkles,
  X,
} from "lucide-react";
import { Ring } from "@/components/Ring";
import { EmptyState, SectionTitle, listItem, listStagger } from "@/components/ui";
import { apiSend, openSheet, useApi } from "@/lib/useApi";
import { cn, fmtDate, greeting, relativeDue, slotTimeLabel, todayKey } from "@/lib/utils";
import type { CourseStat, Summary, TaskRow } from "@/lib/types";

const TYPE_TINT: Record<string, string> = {
  assignment: "#4d9de0",
  test: "#fb5c7a",
  quiz: "#fbbf24",
  lab: "#34d399",
  other: "#a293ff",
};

function AttendanceButtons({ c, today }: { c: CourseStat; today: string }) {
  if (c.todayMark) {
    const s = c.todayMark.status;
    return (
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold",
            s === "present" && "bg-good/15 text-good",
            s === "absent" && "bg-bad/15 text-bad",
            s === "cancelled" && "bg-white/10 text-mute"
          )}
        >
          {s === "present" ? <Check size={13} /> : s === "absent" ? <X size={13} /> : <Minus size={13} />}
          {s === "present" ? "Present" : s === "absent" ? "Absent" : "Cancelled"}
        </span>
        <button
          onClick={() => apiSend(`/api/attendance/${c.todayMark!.id}`, "DELETE")}
          className="pressable text-[11px] font-medium text-faint underline underline-offset-2"
        >
          undo
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() =>
          apiSend("/api/attendance", "POST", {
            courseId: c.id,
            date: today,
            status: "present",
          })
        }
        className="grid size-9 place-items-center rounded-full border border-good/40 bg-good/10 text-good"
        aria-label="Mark present"
      >
        <Check size={16} strokeWidth={2.6} />
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() =>
          apiSend("/api/attendance", "POST", {
            courseId: c.id,
            date: today,
            status: "absent",
          })
        }
        className="grid size-9 place-items-center rounded-full border border-bad/40 bg-bad/10 text-bad"
        aria-label="Mark absent"
      >
        <X size={16} strokeWidth={2.6} />
      </motion.button>
    </div>
  );
}

export { AttendanceButtons };

export default function Dashboard() {
  const { data, loading } = useApi<Summary>("/api/summary");

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-52 rounded-full" />
        <div className="skeleton h-44 rounded-[24px]" />
        <div className="skeleton h-28 rounded-[24px]" />
        <div className="skeleton h-28 rounded-[24px]" />
      </div>
    );
  }

  const riskCount = data.backlogs.riskCourses.length;
  const nextExam = data.upcomingExams[0];

  return (
    <motion.div variants={listStagger} initial="hidden" animate="show">
      {/* header */}
      <motion.div variants={listItem} className="flex items-center justify-between">
        <div>
          <p className="text-[12.5px] font-medium text-mute">
            {fmtDate(data.today, "EEEE, d MMMM")}
          </p>
          <h1 className="font-display text-[26px] font-bold tracking-tight">
            {greeting()},{" "}
            <span className="text-gradient">scholar</span>
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/logs"
            className="pressable relative grid size-11 place-items-center rounded-full border border-line bg-card text-mute"
            aria-label="Logs and backlogs"
          >
            <History size={19} />
            {data.backlogs.overdueCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full bg-bad text-[10px] font-bold text-white">
                {data.backlogs.overdueCount}
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            aria-label="Backup and data"
            className="pressable grid size-11 place-items-center rounded-full bg-gradient-to-b from-[#8b7dff] to-[#6a58f0] font-display text-[15px] font-bold text-white"
          >
            S
          </Link>
        </div>
      </motion.div>

      {/* holiday banner */}
      {data.holidayToday && (
        <motion.div
          variants={listItem}
          className="mt-5 flex items-center gap-3 rounded-[20px] border border-good/25 bg-gradient-to-r from-good/15 to-transparent px-4 py-3.5"
        >
          <Palmtree size={18} className="text-good" />
          <div>
            <p className="text-[14px] font-semibold">{data.holidayToday.title}</p>
            <p className="text-[12px] text-mute">No classes today — recharging counts too.</p>
          </div>
        </motion.div>
      )}

      {/* reminders strip */}
      {data.reminders.length > 0 && (
        <motion.div
          variants={listItem}
          className="mt-5 flex items-center gap-3 rounded-[20px] border border-warn/25 bg-gradient-to-r from-warn/[0.14] to-transparent px-4 py-3"
        >
          <BellRing size={17} className="shrink-0 text-warn" />
          <p className="truncate text-[13px] text-ink/90">
            <span className="font-semibold text-warn">{data.reminders.length} reminder{data.reminders.length > 1 ? "s" : " "}: </span>
            {data.reminders.map((r) => r.title).join(" · ")}
          </p>
        </motion.div>
      )}

      {/* hero attendance */}
      <motion.div variants={listItem} className="card relative mt-6 overflow-hidden p-5">
        <div
          aria-hidden
          className="absolute -top-20 -right-20 size-52 rounded-full bg-[radial-gradient(closest-side,#7b6cff33,transparent)]"
        />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
              Overall attendance
            </p>
            <p className="mt-2 max-w-[180px] text-[13.5px] leading-snug text-mute">
              {data.overall.total === 0
                ? "Mark your first class to start tracking."
                : riskCount > 0
                ? `${riskCount} course${riskCount > 1 ? "s are" : " is"} below target — see backlogs.`
                : "Every course is above target. Beautiful work."}
            </p>
            {data.overdueTasks.length > 0 && (
              <Link
                href="/logs"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-bad/12 px-3 py-1.5 text-[12px] font-semibold text-bad"
              >
                <Flame size={13} />
                {data.overdueTasks.length} overdue backlog{data.overdueTasks.length > 1 ? "s" : ""}
              </Link>
            )}
          </div>
          <Ring
            value={data.overall.percentage}
            size={118}
            label={`${Math.round(data.overall.percentage)}%`}
            sublabel={`${data.overall.present}/${data.overall.total}`}
            from={data.overall.percentage >= 75 ? "#34d399" : "#fb5c7a"}
            to={data.overall.percentage >= 75 ? "#7b6cff" : "#fbbf24"}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {[
            { label: "Courses", value: data.courses.length, icon: GraduationCap },
            { label: "Attended", value: data.overall.present, icon: Check },
            { label: "Exams near", value: data.upcomingExams.length, icon: CalendarClock },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-white/[0.03] px-3 py-2.5">
              <s.icon size={14} className="text-primary2" />
              <p className="mt-1 font-display text-[19px] font-bold tabular-nums leading-none">
                {s.value}
              </p>
              <p className="mt-1 text-[10.5px] font-medium text-faint">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* today lectures */}
      <motion.div variants={listItem}>
        <SectionTitle
          right={
            <Link href="/attendance" className="flex items-center gap-1 text-[12.5px] font-semibold text-primary2">
              Attendance <ArrowUpRight size={14} />
            </Link>
          }
        >
          Today&apos;s lectures
        </SectionTitle>
        {data.todayLectures.length === 0 ? (
          data.courses.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Add your first course"
              hint="Set the days and time it meets. Today's lectures and attendance tracking build themselves from that."
              action={
                <button
                  onClick={() => openSheet("course")}
                  className="pressable rounded-full bg-primary/15 px-4 py-2 text-[13px] font-semibold text-primary2"
                >
                  Add a course
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title={data.holidayToday ? "Holiday mode" : "No lectures today"}
              hint={data.holidayToday ? "Enjoy the break — you've earned it." : "Free day. Perfect for clearing backlogs."}
            />
          )
        ) : (
          <div className="space-y-2.5">
            {data.todayLectures.map((c) => (
              <div key={c.id} className="card flex items-center gap-3.5 px-4 py-3.5">
                <div
                  className="grid size-11 shrink-0 place-items-center rounded-2xl font-display text-[15px] font-bold"
                  style={{ background: `${c.color}22`, color: c.color }}
                >
                  {c.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{c.name}</p>
                  <p className="truncate text-[12px] text-mute">
                    {c.todaySlots.map(slotTimeLabel).filter(Boolean).join("  ·  ") || "Scheduled today"}
                    {c.location ? ` · ${c.location}` : ""}
                  </p>
                </div>
                <AttendanceButtons c={c} today={data.today} />
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* deadlines */}
      <motion.div variants={listItem}>
        <SectionTitle
          right={
            <Link href="/planner" className="flex items-center gap-1 text-[12.5px] font-semibold text-primary2">
              Planner <ArrowUpRight size={14} />
            </Link>
          }
        >
          Coming up
        </SectionTitle>
        {data.upcomingTasks.length === 0 && data.overdueTasks.length === 0 ? (
          <EmptyState
            icon={AlarmClockCheck}
            title="Nothing due"
            hint="Add an assignment or test reminder and it will land here."
            action={
              <button
                onClick={() => openSheet("task")}
                className="pressable rounded-full bg-primary/15 px-4 py-2 text-[13px] font-semibold text-primary2"
              >
                New reminder
              </button>
            }
          />
        ) : (
          <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
            {[...data.overdueTasks, ...data.upcomingTasks].slice(0, 8).map((t: TaskRow) => {
              const overdue = t.dueDate < data.today;
              return (
                <Link
                  href="/planner"
                  key={t.id}
                  className={cn(
                    "pressable card w-[218px] shrink-0 snap-start p-4",
                    overdue && "border-bad/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider"
                      style={{
                        background: `${TYPE_TINT[t.type]}1f`,
                        color: TYPE_TINT[t.type],
                      }}
                    >
                      {t.type}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold",
                        overdue ? "text-bad" : t.dueDate === data.today ? "text-warn" : "text-faint"
                      )}
                    >
                      {relativeDue(t.dueDate)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[38px] text-[14px] leading-snug font-semibold">
                    {t.title}
                  </p>
                  {t.courseName && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-mute">
                      <span className="size-1.5 rounded-full" style={{ background: t.courseColor ?? "#666" }} />
                      {t.courseName}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* next exam */}
      <motion.div variants={listItem}>
        <SectionTitle
          right={
            <Link href="/calendar" className="flex items-center gap-1 text-[12.5px] font-semibold text-primary2">
              Calendar <ArrowUpRight size={14} />
            </Link>
          }
        >
          Next exam
        </SectionTitle>
        {nextExam ? (
          <Link
            href="/calendar"
            className="pressable card relative flex items-center gap-4 overflow-hidden p-5"
          >
            <div
              aria-hidden
              className="absolute -bottom-16 -left-16 size-44 rounded-full bg-[radial-gradient(closest-side,#a293ff26,transparent)]"
            />
            <div className="grid size-[58px] shrink-0 place-items-center rounded-[18px] border border-primary/30 bg-primary/10">
              <div className="text-center">
                <p className="font-display text-[20px] font-bold leading-none text-primary2">
                  {Math.max(0, Math.ceil((new Date(nextExam.date + "T00:00:00").getTime() - new Date(todayKey() + "T00:00:00").getTime()) / 86400000))}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-primary2/80">
                  days
                </p>
              </div>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{nextExam.subject}</p>
              <p className="mt-0.5 text-[12.5px] text-mute">
                {fmtDate(nextExam.date)}
                {nextExam.startTime ? ` · ${nextExam.startTime}` : ""}
                {nextExam.venue ? ` · ${nextExam.venue}` : ""}
              </p>
            </div>
          </Link>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="No exams scheduled"
            hint="Import your timetable and the calendar builds itself."
            action={
              <button
                onClick={() => openSheet("import")}
                className="pressable rounded-full bg-primary/15 px-4 py-2 text-[13px] font-semibold text-primary2"
              >
                Import timetable
              </button>
            }
          />
        )}
      </motion.div>

      {/* syllabus snapshot */}
      <motion.div variants={listItem}>
        <SectionTitle
          right={
            <Link href="/syllabus" className="flex items-center gap-1 text-[12.5px] font-semibold text-primary2">
              Syllabus <ArrowUpRight size={14} />
            </Link>
          }
        >
          Syllabus pace
        </SectionTitle>
        <div className="card divide-y divide-line overflow-hidden">
          {data.courses.filter((c) => data.syllabusProgress[c.id]).slice(0, 3).map((c) => {
            const p = data.syllabusProgress[c.id];
            const value = p.total ? Math.round((p.done / p.total) * 100) : 0;
            return (
              <Link key={c.id} href="/syllabus" className="pressable flex items-center gap-3 px-4 py-3.5">
                <BookOpen size={15} style={{ color: c.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13.5px] font-semibold">{c.name}</p>
                    <p className="text-[11.5px] font-semibold tabular-nums text-mute">{value}%</p>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${value}%` }}
                      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full"
                      style={{ background: c.color }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
          {data.courses.filter((c) => data.syllabusProgress[c.id]).length === 0 && (
            <div className="px-4 py-5 text-center text-[13px] text-mute">
              No topics yet — add your syllabus to start the pace meter.
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
