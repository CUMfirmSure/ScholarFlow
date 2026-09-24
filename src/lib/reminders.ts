/**
 * Schedules real Android notifications for pending tasks.
 * Rule (matches the app's model): fire at 9:00 AM, `remindDaysBefore` days before dueDate.
 * Idempotent: cancels + reschedules the full set each time, so edits/deletes never leave ghosts.
 */
import { Capacitor } from "@capacitor/core";
import { subDays, setHours, setMinutes, setSeconds, parseISO, isAfter } from "date-fns";
import type { TaskRow } from "./types";

// Stable numeric id per task so a reschedule replaces rather than duplicates.
const nid = (taskId: number) => 100000 + taskId;

export async function syncReminders(tasks: TaskRow[]) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== "granted") return;
    }

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length)
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });

    const now = new Date();
    const notifications = tasks
      .filter((t) => t.status === "pending")
      .map((t) => {
        const days = Math.max(0, t.remindDaysBefore ?? 1);
        const at = setSeconds(setMinutes(setHours(subDays(parseISO(t.dueDate), days), 9), 0), 0);
        return { t, at };
      })
      .filter(({ at }) => isAfter(at, now))
      .map(({ t, at }) => ({
        id: nid(t.id),
        title: t.courseName ? `${t.type.toUpperCase()} · ${t.courseName}` : t.type.toUpperCase(),
        body: `${t.title} — due ${t.dueDate}`,
        schedule: { at, allowWhileIdle: true },
      }));

    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch (e) {
    console.warn("[reminders] sync failed", e);
  }
}
