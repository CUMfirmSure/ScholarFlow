/**
 * File in/out that works in BOTH a desktop browser and the Android WebView.
 *
 * Android WebView does not honour <a download> for Blob URLs, so on-device we
 * write to the app cache and open the system share sheet (Drive, WhatsApp,
 * Files, email...). In a browser we fall back to a normal download.
 */
import { Capacitor } from "@capacitor/core";

export type SaveResult = { ok: true; via: "share" | "download" } | { ok: false; cancelled?: boolean; error?: string };

export async function saveTextFile(
  filename: string,
  contents: string,
  mimeType = "application/json"
): Promise<SaveResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      const written = await Filesystem.writeFile({
        path: filename,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      try {
        await Share.share({
          title: "ScholarFlow backup",
          text: "ScholarFlow backup file",
          url: written.uri,
          dialogTitle: "Save your backup",
        });
        return { ok: true, via: "share" };
      } catch (e) {
        // Dismissing the share sheet rejects; that's a cancel, not a failure.
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        if (msg.includes("cancel") || msg.includes("dismiss")) return { ok: false, cancelled: true };
        throw e;
      }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }

  try {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, via: "download" };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * <input type="file"> works in the Android WebView (opens the system picker),
 * so the same code path serves both platforms.
 */
export function pickTextFile(accept = "application/json,.json"): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return done(null);
      // A ScholarFlow backup is tens of KB; anything huge is the wrong file.
      if (f.size > 25 * 1024 * 1024) return done(null);
      try {
        done(await f.text());
      } catch {
        done(null);
      }
    };
    input.addEventListener("cancel", () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}
