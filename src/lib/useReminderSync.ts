import { useEffect } from "react";
import { REFRESH_EVENT } from "@/lib/useApi";
import { syncReminders } from "@/lib/reminders";
import type { TaskRow } from "@/lib/types";

export function useReminderSync() {
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = await fetch("/api/tasks", { cache: "no-store" });
        const rows = (await res.json()) as TaskRow[];
        if (alive) await syncReminders(rows);
      } catch {
        /* non-fatal */
      }
    };
    run();
    window.addEventListener(REFRESH_EVENT, run);
    return () => {
      alive = false;
      window.removeEventListener(REFRESH_EVENT, run);
    };
  }, []);
}
