import { Route, Routes } from "react-router-dom";
import { SiteFrame } from "@/components/SiteFrame";
import { PageShell } from "@/components/PageShell";
import Home from "@/app/page";
import Attendance from "@/app/attendance/page";
import Calendar from "@/app/calendar/page";
import Logs from "@/app/logs/page";
import Planner from "@/app/planner/page";
import Syllabus from "@/app/syllabus/page";
import Settings from "@/app/settings/page";
import { useReminderSync } from "@/lib/useReminderSync";
import { useBackButton } from "@/lib/useBackButton";

export function App() {
  useReminderSync();
  useBackButton();
  return (
    <>
      {/* ambient aurora (was in layout.tsx) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#7b6cff22,transparent)] blur-2xl" />
        <div className="absolute top-1/2 -left-40 h-[380px] w-[380px] rounded-full bg-[radial-gradient(closest-side,#4d9de018,transparent)] blur-2xl" />
        <div className="absolute -right-40 bottom-0 h-[380px] w-[380px] rounded-full bg-[radial-gradient(closest-side,#fb5c7a12,transparent)] blur-2xl" />
      </div>
      <SiteFrame>
        <Routes>
          <Route path="/" element={<PageShell><Home /></PageShell>} />
          <Route path="/attendance" element={<PageShell><Attendance /></PageShell>} />
          <Route path="/planner" element={<PageShell><Planner /></PageShell>} />
          <Route path="/calendar" element={<PageShell><Calendar /></PageShell>} />
          <Route path="/syllabus" element={<PageShell><Syllabus /></PageShell>} />
          <Route path="/logs" element={<PageShell><Logs /></PageShell>} />
          <Route path="/settings" element={<PageShell><Settings /></PageShell>} />
          <Route path="*" element={<PageShell><Home /></PageShell>} />
        </Routes>
      </SiteFrame>
    </>
  );
}
