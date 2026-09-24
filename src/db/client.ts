/**
 * Installs an on-device replacement for the server: any fetch("/api/...") is
 * answered locally by the router. Every existing page/component keeps calling
 * fetch()/useApi()/apiSend() unchanged.
 */
import { Store, browserPersistence } from "./store";
import { handle } from "./router";
import { ensureSeeded } from "./seed";

export const store = new Store(browserPersistence());

let installed = false;

export async function installLocalApi() {
  if (installed) return;
  installed = true;

  await ensureSeeded(store);

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    // Only intercept same-app /api/* calls; everything else is untouched.
    let path = urlStr;
    try {
      const u = new URL(urlStr, window.location.href);
      if (u.origin === window.location.origin) path = u.pathname + u.search;
    } catch {
      /* keep as-is */
    }
    if (!path.startsWith("/api/")) return realFetch(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let body: Record<string, unknown> | null = null;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = null;
      }
    }

    const { status, body: out } = await handle(store, method, path, body);
    return new Response(JSON.stringify(out), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
