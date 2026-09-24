"use client";

import Link from "@/compat/next-link";
import { usePathname, useRouter } from "@/compat/next-navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  House,
  CalendarCheck,
  NotebookPen,
  CalendarDays,
  BookOpen,
  Plus,
  UserCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { openSheet, type SheetKind } from "@/lib/useApi";
import { GlobalSheets } from "@/components/Sheets";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/attendance", label: "Attend", icon: CalendarCheck },
  { href: "/planner", label: "Planner", icon: NotebookPen },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/syllabus", label: "Syllabus", icon: BookOpen },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [fabOpen, setFabOpen] = useState(false);

  useEffect(() => {
    setFabOpen(false);
  }, [pathname]);

  const runAction = (kind: SheetKind | "attendance") => {
    setFabOpen(false);
    if (kind === "attendance") {
      router.push("/attendance");
      return;
    }
    setTimeout(() => openSheet(kind), 60);
  };

  return (
    <>
      <GlobalSheets />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px]">
        {/* speed-dial actions */}
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              className="pointer-events-auto absolute right-5 bottom-24 flex w-44 flex-col gap-1.5"
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {[
                { kind: "task" as const, label: "New reminder" },
                { kind: "import" as const, label: "Import timetable" },
                { kind: "exam" as const, label: "Add exam" },
                { kind: "holiday" as const, label: "Mark holiday" },
                { kind: "course" as const, label: "Add course" },
                { kind: "topic" as const, label: "Add topics" },
                { kind: "attendance" as const, label: "Mark attendance" },
              ].map((a, i) => (
                <motion.button
                  key={a.kind}
                  onClick={() => runAction(a.kind)}
                  className="pressable flex items-center justify-between gap-2 rounded-2xl border border-line bg-elev/95 px-4 py-3 text-[13.5px] font-medium text-ink shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                  variants={{
                    hidden: { opacity: 0, y: 16, scale: 0.92 },
                    show: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: { delay: i * 0.035, duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                    },
                    exit: {
                      opacity: 0,
                      y: 10,
                      scale: 0.95,
                      transition: { duration: 0.15 },
                    },
                  }}
                >
                  {a.label}
                  <span className="grid size-6 place-items-center rounded-full bg-white/[0.06] text-primary2">
                    <UserCheck size={12} className={a.kind === "attendance" ? "" : "hidden"} />
                    <Plus size={12} className={a.kind === "attendance" ? "hidden" : ""} />
                  </span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => setFabOpen((v) => !v)}
          aria-label="Quick actions"
          className="pointer-events-auto absolute right-5 bottom-[84px] grid size-14 place-items-center rounded-full bg-gradient-to-b from-[#8b7dff] to-[#6a58f0] text-white shadow-[0_16px_36px_-8px_#7b6cff99]"
        >
          <motion.span
            animate={{ rotate: fabOpen ? 135 : 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="grid place-items-center"
          >
            <Plus size={26} strokeWidth={2.4} />
          </motion.span>
        </motion.button>

        {/* scrim when FAB open */}
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              className="fixed inset-0 -z-10 bg-black/45 backdrop-blur-[2px]"
              style={{ pointerEvents: "auto" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFabOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* tab bar */}
        <nav
          className="pointer-events-auto mx-4 mb-[calc(0.9rem+env(safe-area-inset-bottom))] flex h-[66px] items-center justify-between rounded-[26px] border border-line bg-surface/90 px-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        >
          {TABS.map((t) => {
            const active =
              t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "relative flex h-full flex-1 flex-col items-center justify-center gap-1",
                  active ? "text-primary2" : "text-faint"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-x-1.5 top-1/2 h-[46px] -translate-y-1/2 rounded-full bg-primary/[0.14]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <motion.span
                  className="relative grid place-items-center"
                  whileTap={{ scale: 0.85 }}
                  animate={{ y: active ? -1 : 0 }}
                >
                  <Icon size={21} strokeWidth={active ? 2.3 : 2} />
                </motion.span>
                <span
                  className={cn(
                    "relative text-[9.5px] font-semibold tracking-wide",
                    active ? "text-primary2" : "text-faint"
                  )}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
