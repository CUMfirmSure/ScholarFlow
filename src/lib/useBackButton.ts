import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

/**
 * Android hardware back: go back a page; on the home screen, exit the app.
 * Without this, Capacitor's default closes the whole app from any inner tab.
 */
export function useBackButton() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App } = await import("@capacitor/app");
      const h = await App.addListener("backButton", () => {
        if (pathname === "/" || pathname === "") App.exitApp();
        else nav(-1);
      });
      remove = () => h.remove();
    })();
    return () => remove?.();
  }, [nav, pathname]);
}
