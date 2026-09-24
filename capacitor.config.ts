import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.scholarflow.app",
  appName: "ScholarFlow",
  webDir: "dist",
  backgroundColor: "#06070b",
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: "#06070b" },
    StatusBar: { style: "DARK", backgroundColor: "#06070b", overlaysWebView: false },
  },
};

export default config;
