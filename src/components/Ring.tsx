"use client";

import { motion } from "framer-motion";
import { useId } from "react";

export function Ring({
  value,
  size = 128,
  stroke = 11,
  from = "#7b6cff",
  to = "#a293ff",
  track = "#ffffff12",
  delay = 0,
  label,
  sublabel,
}: {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  from?: string;
  to?: string;
  track?: string;
  delay?: number;
  label?: string;
  sublabel?: string;
}) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clamped / 100) }}
          transition={{ duration: 1.3, delay, ease: [0.22, 1, 0.36, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {(label || sublabel) && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-display text-2xl font-bold tabular-nums leading-none">
              {label}
            </div>
            {sublabel && (
              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
                {sublabel}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
