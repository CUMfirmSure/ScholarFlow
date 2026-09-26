export type SlotRow = {
  id: number;
  courseId: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  label: string;
  sortOrder: number;
};

export type CourseRow = {
  id: number;
  name: string;
  code: string;
  color: string;
  instructor: string;
  location: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  targetPercent: number;
  startDate: string;
  createdAt: string;
  slots?: SlotRow[];
};

export type AttendanceRow = {
  id: number;
  courseId: number;
  date: string;
  /** Which lecture of that day this is — 1 for the normal case, 2+ when a
   * subject meets more than once on the same date. */
  session: number;
  status: "present" | "absent" | "cancelled";
  note: string;
  createdAt: string;
};

export type TaskRow = {
  id: number;
  title: string;
  type: "assignment" | "test" | "quiz" | "lab" | "other";
  courseId: number | null;
  dueDate: string;
  dueTime: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "done";
  notes: string;
  remindDaysBefore: number;
  createdAt: string;
  completedAt: string | null;
  courseName?: string | null;
  courseColor?: string | null;
};

export type ExamRow = {
  id: number;
  subject: string;
  courseId: number | null;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  notes: string;
  createdAt: string;
  courseColor?: string | null;
};

export type HolidayRow = {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  kind: "holiday" | "break" | "personal";
  createdAt: string;
};

export type SyllabusRow = {
  id: number;
  courseId: number;
  unit: string;
  topic: string;
  status: "pending" | "in_progress" | "done";
  sortOrder: number;
  createdAt: string;
};

export type LogRow = {
  id: number;
  action: string;
  entity: string;
  detail: string;
  createdAt: string;
};

export type ExamWindowStat = {
  /** The nearest upcoming exam this window is measured against. */
  examDate: string;
  examSubject: string;
  startDate: string;
  present: number;
  absent: number;
  cancelled: number;
  /** How many lecture instances the weekly schedule implies in this window
   * (holidays excluded), independent of what's actually been marked. */
  scheduled: number;
  percentage: number;
};

export type CourseStat = CourseRow & {
  present: number;
  absent: number;
  cancelled: number;
  total: number;
  percentage: number;
  bunk: { state: "none" | "safe" | "risk"; message: string };
  todayMark: AttendanceRow | null;
  todayMarks: AttendanceRow[];
  meetsToday: boolean;
  slots: SlotRow[];
  todaySlots: SlotRow[];
  last14: { date: string; status: string | null }[];
  examWindow: ExamWindowStat | null;
};

export type Summary = {
  today: string;
  holidayToday: HolidayRow | null;
  courses: CourseStat[];
  todayLectures: CourseStat[];
  overall: { present: number; total: number; percentage: number };
  upcomingTasks: TaskRow[];
  overdueTasks: TaskRow[];
  reminders: TaskRow[];
  upcomingExams: ExamRow[];
  upcomingHolidays: HolidayRow[];
  syllabusProgress: Record<string, { done: number; total: number }>;
  recentLogs: LogRow[];
  backlogs: {
    overdueCount: number;
    riskCourses: {
      id: number;
      name: string;
      color: string;
      percentage: number;
      targetPercent: number;
      message: string;
    }[];
    pendingTopics: number;
  };
};
