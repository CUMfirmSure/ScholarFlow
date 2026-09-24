import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./app/globals.css";
import { installLocalApi } from "@/db/client";
import { App } from "./App";
import { initNative } from "@/lib/native";

async function boot() {
  // The local "server" must be live before any page fetches data.
  await installLocalApi();
  initNative();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {/* HashRouter: works under capacitor://localhost with no server-side rewrites. */}
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>
  );
}

boot();
