/**
 * Native (Capacitor) integration. Every call is guarded so the exact same bundle
 * runs in a normal browser during development.
 */
import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

export async function initNative() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#06070b" });
  } catch (e) {
    console.warn("[native] status bar", e);
  }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* non-fatal */
  }
}
