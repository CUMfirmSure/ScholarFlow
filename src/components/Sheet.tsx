"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center">
            <motion.div
              className="pointer-events-auto w-full max-w-[430px]"
              initial={{ y: "104%" }}
              animate={{ y: 0 }}
              exit={{ y: "106%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.55 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 550) onClose();
              }}
            >
              <div className="max-h-[86dvh] overflow-y-auto no-scrollbar rounded-t-[28px] border-x border-t border-line bg-surface px-5 pt-3 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
                <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-white/15" />
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-xl font-semibold tracking-tight">
                      {title}
                    </h2>
                    {subtitle && (
                      <p className="mt-0.5 text-[13px] text-mute">{subtitle}</p>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="pressable grid size-9 shrink-0 place-items-center rounded-full border border-line bg-white/5 text-mute"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
