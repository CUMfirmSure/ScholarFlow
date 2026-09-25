"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const REFRESH_EVENT = "sf:refresh";
export const OPEN_EVENT = "sf:open";

export type SheetKind =
  | "task"
  | "course"
  | "exam"
  | "import"
  | "holiday"
  | "topic"
  | "past_attendance"
  | "report"
  | "permissions";

export function openSheet(kind: SheetKind) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: kind }));
}

export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (mounted.current) setData(json);
    } catch {
      /* keep old data */
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    refetch();
    const onRefresh = () => refetch();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      mounted.current = false;
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [refetch]);

  return { data, loading, refetch };
}

export async function apiSend(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  window.dispatchEvent(new Event(REFRESH_EVENT));
  return json;
}
