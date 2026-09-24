"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-2xl border border-line bg-white/[0.04] px-4 py-3 text-[15px] text-ink placeholder:text-faint outline-none transition-colors focus:border-primary/60 focus:bg-white/[0.06]";

export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              "pressable relative rounded-full border px-3.5 py-2 text-[13px] font-medium capitalize transition-colors",
              active
                ? "border-primary/50 bg-primary/15 text-primary2"
                : "border-line bg-white/[0.03] text-mute"
            )}
          >
            {render ? render(o) : o.replace("_", " ")}
          </button>
        );
      })}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#8b7dff] to-[#6a58f0] px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_#7b6cff88] transition-opacity",
        (disabled || loading) && "opacity-50"
      )}
    >
      {loading && (
        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      )}
      {children}
    </motion.button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-white/[0.05] text-mute">
        <Icon size={22} />
      </div>
      <p className="font-display text-[15px] font-semibold">{title}</p>
      {hint && <p className="max-w-[260px] text-[13px] text-mute">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between">
      <h2 className="font-display text-[17px] font-semibold tracking-tight">
        {children}
      </h2>
      {right}
    </div>
  );
}

export const listStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};

export const listItem = {
  hidden: { opacity: 0, y: 18, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};
