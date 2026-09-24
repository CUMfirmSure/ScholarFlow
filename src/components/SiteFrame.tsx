"use client";

import { BottomNav } from "@/components/BottomNav";

export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-[430px] sm:border-x sm:border-line">
      {children}
      <BottomNav />
    </div>
  );
}
