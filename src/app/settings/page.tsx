import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  ArrowLeft,
  Download,
  FileUp,
  HardDrive,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "@/compat/next-link";
import { listItem, listStagger } from "@/components/ui";
import { store } from "@/db/client";
import { backupFilename, clearAllData, makeBackup, restoreBackup } from "@/db/backup";
import { pickTextFile, saveTextFile } from "@/lib/files";
import { REFRESH_EVENT } from "@/lib/useApi";
import { cn } from "@/lib/utils";

type Notice = { kind: "ok" | "err" | "info"; text: string } | null;

const LAST_KEY = "scholarflow:lastBackup";

function Row({
  icon: Icon,
  title,
  body,
  tone = "primary",
  children,
}: {
  icon: typeof Download;
  title: string;
  body: string;
  tone?: "primary" | "bad";
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={listItem}
      className={cn("card p-4", tone === "bad" && "border-bad/25")}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-2xl",
            tone === "bad" ? "bg-bad/15 text-bad" : "bg-primary/15 text-primary2"
          )}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-mute">{body}</p>
        </div>
      </div>
      <div className="mt-3.5">{children}</div>
    </motion.div>
  );
}

const btn =
  "pressable flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-semibold disabled:opacity-50";

export default function SettingsPage() {
  const [busy, setBusy] = useState<null | "export" | "import" | "clear">(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "restore" | "clear">(null);
  const [pendingRaw, setPendingRaw] = useState<string | null>(null);

  const refreshCounts = async () => {
    await store.whenReady();
    const b = makeBackup(store.db);
    setCounts(b.counts);
  };

  useEffect(() => {
    refreshCounts();
    setLastBackup(localStorage.getItem(LAST_KEY));
  }, []);

  // A confirmation must not linger: it auto-expires so a stray later tap can't fire it.
  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(null), 6000);
    return () => clearTimeout(id);
  }, [confirm]);

  const announce = () => window.dispatchEvent(new Event(REFRESH_EVENT));

  async function onExport() {
    setBusy("export");
    setNotice(null);
    try {
      await store.whenReady();
      const file = makeBackup(store.db);
      const res = await saveTextFile(backupFilename(), JSON.stringify(file, null, 2));
      if (res.ok) {
        const stamp = new Date().toISOString();
        localStorage.setItem(LAST_KEY, stamp);
        setLastBackup(stamp);
        setNotice({
          kind: "ok",
          text:
            res.via === "share"
              ? "Backup ready. Save it to Drive, WhatsApp-to-self, or Files, somewhere off this phone."
              : "Backup downloaded.",
        });
      } else if (!res.cancelled) {
        setNotice({ kind: "err", text: `Couldn't create the backup. ${res.error ?? ""}`.trim() });
      }
    } finally {
      setBusy(null);
    }
  }

  async function onPick() {
    setNotice(null);
    setBusy("import");
    try {
      const raw = await pickTextFile();
      if (raw === null) return; // cancelled or unreadable
      setPendingRaw(raw);
      setConfirm("restore");
    } finally {
      setBusy(null);
    }
  }

  async function onConfirmRestore() {
    if (!pendingRaw) return;
    setBusy("import");
    try {
      const res = await restoreBackup(store, pendingRaw);
      if (res.ok) {
        const c = res.counts;
        setNotice({
          kind: "ok",
          text:
            `Restored ${c.courses} courses, ${c.tasks} tasks, ${c.exams} exams, ` +
            `${c.attendance} attendance marks, ${c.syllabus} topics.` +
            (res.repaired.length ? ` Fixed: ${res.repaired.join("; ")}.` : ""),
        });
        announce();
        await refreshCounts();
      } else {
        setNotice({ kind: "err", text: `${res.error} Your current data was not changed.` });
      }
    } finally {
      setPendingRaw(null);
      setConfirm(null);
      setBusy(null);
    }
  }

  async function onConfirmClear() {
    setBusy("clear");
    try {
      await clearAllData(store);
      announce();
      await refreshCounts();
      setNotice({ kind: "ok", text: "All data cleared. You're starting with a clean slate." });
    } finally {
      setConfirm(null);
      setBusy(null);
    }
  }

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) - (counts.logs ?? 0) : 0;

  return (
    <motion.div variants={listStagger} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={listItem}>
        <Link
          href="/"
          className="pressable mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary2"
        >
          <ArrowLeft size={15} /> Home
        </Link>
        <p className="text-[12.5px] font-medium text-mute">Your data, your control</p>
        <h1 className="font-display text-[26px] font-bold tracking-tight">
          Backup <span className="text-gradient">&</span> Data
        </h1>
      </motion.div>

      <motion.div
        variants={listItem}
        className="flex items-start gap-3 rounded-[20px] border border-good/25 bg-gradient-to-r from-good/12 to-transparent px-4 py-3.5"
      >
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-good" />
        <p className="text-[12.5px] leading-relaxed text-mute">
          Everything lives <span className="font-semibold text-ink">only on this phone</span>. There
          is no account and no server. That's private, but it means{" "}
          <span className="font-semibold text-ink">
            uninstalling the app or losing the phone erases your data
          </span>{" "}
          unless you keep a backup.
        </p>
      </motion.div>

      <motion.div variants={listItem} className="grid grid-cols-2 gap-2.5">
        <div className="card p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Records</p>
          <p className="font-display text-2xl font-bold">{counts ? total : "—"}</p>
        </div>
        <div className="card p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
            Last backup
          </p>
          <p
            className={cn(
              "font-display text-[15px] font-bold leading-tight pt-1.5",
              !lastBackup && "text-warn"
            )}
          >
            {lastBackup ? format(new Date(lastBackup), "d MMM, h:mm a") : "Never"}
          </p>
        </div>
      </motion.div>

      {notice && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          className={cn(
            "rounded-2xl border px-4 py-3 text-[13px] leading-relaxed",
            notice.kind === "ok" && "border-good/25 bg-good/10 text-good",
            notice.kind === "err" && "border-bad/30 bg-bad/10 text-bad",
            notice.kind === "info" && "border-line bg-white/[0.03] text-mute"
          )}
        >
          {notice.text}
        </motion.div>
      )}

      <Row
        icon={Download}
        title="Export backup"
        body="Saves everything (courses, attendance, tasks, exams, holidays, syllabus) as one JSON file you can keep anywhere."
      >
        <button
          onClick={onExport}
          disabled={busy !== null}
          className={cn(
            btn,
            "bg-gradient-to-b from-[#8b7dff] to-[#6a58f0] text-white shadow-[0_10px_30px_-8px_#7b6cff88]"
          )}
        >
          {busy === "export" ? "Preparing…" : "Export backup"}
        </button>
      </Row>

      <Row
        icon={FileUp}
        title="Restore from backup"
        body="Replaces what's on this phone with the contents of a backup file. The file is fully checked first; if anything's wrong, nothing changes."
      >
        {confirm === "restore" ? (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-[12.5px] text-warn">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              This will replace all current data. Continue?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setConfirm(null);
                  setPendingRaw(null);
                }}
                className={cn(btn, "border border-line bg-white/[0.04] text-mute")}
              >
                Cancel
              </button>
              <button
                onClick={onConfirmRestore}
                disabled={busy !== null}
                className={cn(btn, "bg-warn/20 text-warn")}
              >
                {busy === "import" ? "Restoring…" : "Yes, replace"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onPick}
            disabled={busy !== null}
            className={cn(btn, "border border-line bg-white/[0.04] text-ink")}
          >
            Choose backup file…
          </button>
        )}
      </Row>

      <Row
        icon={Trash2}
        tone="bad"
        title="Clear all data"
        body="Deletes everything, including the sample courses that came with the app, so you can enter your own. This can't be undone. Export first if unsure."
      >
        {confirm === "clear" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirm(null)}
              className={cn(btn, "border border-line bg-white/[0.04] text-mute")}
            >
              Cancel
            </button>
            <button
              onClick={onConfirmClear}
              disabled={busy !== null}
              className={cn(btn, "bg-bad/20 text-bad")}
            >
              {busy === "clear" ? "Clearing…" : "Yes, delete all"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirm("clear")}
            disabled={busy !== null}
            className={cn(btn, "border border-bad/30 bg-bad/10 text-bad")}
          >
            Clear all data…
          </button>
        )}
      </Row>

      <motion.p
        variants={listItem}
        className="flex items-center justify-center gap-1.5 pt-1 text-[11.5px] text-faint"
      >
        <HardDrive size={12} /> Stored on-device · ScholarFlow 1.0
      </motion.p>
    </motion.div>
  );
}
