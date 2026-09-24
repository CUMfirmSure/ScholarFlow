import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format,
  parseISO,
  differenceInCalendarDays,
  addDays,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function todayKey(d: Date = new Date()) {
  return format(d, "yyyy-MM-dd");
}

export function fmtDate(key: string, pattern = "EEE, d MMM") {
  try {
    return format(parseISO(key), pattern);
  } catch {
    return key;
  }
}

export function relativeDue(key: string): string {
  const days = differenceInCalendarDays(parseISO(key), new Date());
  if (days < 0)
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days} days`;
  return fmtDate(key, "d MMM");
}

export function daysUntil(key: string): number {
  return differenceInCalendarDays(parseISO(key), new Date());
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function eachDateKey(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let cur = parseISO(startKey);
  const end = parseISO(endKey);
  let guard = 0;
  while (cur <= end && guard < 62) {
    out.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

/** days_of_week stores 'sun'..'sat' */
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export function dowKey(d: Date = new Date()): string {
  return DOW[d.getDay()];
}

export const DOW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DowKey = (typeof DOW_ORDER)[number];

export const DOW_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export function slotTimeLabel(s: { startTime: string; endTime: string }) {
  if (s.startTime && s.endTime) return `${s.startTime} – ${s.endTime}`;
  if (s.startTime) return s.startTime;
  return "";
}

export function bunkMath(
  present: number,
  total: number,
  targetPercent: number
): { state: "none" | "safe" | "risk"; message: string } {
  const target = targetPercent / 100;
  if (total === 0) return { state: "none", message: "No classes recorded yet" };
  const p = present / total;
  if (p >= target) {
    const x = Math.floor(present / target - total + 1e-9);
    return {
      state: "safe",
      message:
        Math.max(0, x) === 0
          ? "Attend every next class to stay safe"
          : `You can miss ${Math.max(0, x)} and still hold ${targetPercent}%`,
    };
  }
  const n = Math.ceil((target * total - present) / (1 - target) - 1e-9);
  return {
    state: "risk",
    message: `${Math.max(1, n)} straight attendances to reach ${targetPercent}%`,
  };
}

export const COURSE_COLORS = [
  "#6C5CE7",
  "#4D9DE0",
  "#22C55E",
  "#F59E0B",
  "#EF476F",
  "#14B8A6",
  "#F97316",
  "#A78BFA",
];

export const TASK_TYPES = [
  { key: "assignment", label: "Assignment" },
  { key: "test", label: "Test" },
  { key: "quiz", label: "Quiz" },
  { key: "lab", label: "Lab Record" },
  { key: "other", label: "Other" },
];

export function pct(present: number, total: number) {
  if (total === 0) return 0;
  return Math.round((present / total) * 1000) / 10;
}
