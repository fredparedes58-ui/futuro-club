/**
 * VITAS · lazyWithRetry
 *
 * Wraps React.lazy() with two safety nets to handle the classic "stale
 * Service Worker serves old index.html that references chunks that no
 * longer exist after a new deploy" problem.
 *
 * Behavior:
 *   1. First attempt: normal dynamic import.
 *   2. On failure (typically TypeError: Failed to fetch dynamically
 *      imported module), wait 200ms and retry once — covers transient
 *      network blips.
 *   3. If retry also fails: set a sessionStorage flag and reload the
 *      page once. The flag prevents an infinite reload loop on the
 *      reload attempt itself.
 *
 * Usage:
 *   const Page = lazyWithRetry(() => import("./pages/Page"));
 *
 * Drop-in replacement for React.lazy().
 */

import { lazy, type ComponentType } from "react";

const RELOAD_FLAG = "vitas_chunk_reload_done";

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as Error)?.message ?? "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    msg.includes("Importing a module script failed")
  );
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (!isChunkLoadError(err)) throw err;

      console.warn("[lazyWithRetry] chunk load failed, retrying once…", err);
      await new Promise((r) => setTimeout(r, 200));

      try {
        return await factory();
      } catch (err2) {
        if (!isChunkLoadError(err2)) throw err2;

        // Last resort: force a full reload once.
        const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG);
        if (!alreadyReloaded) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          console.warn(
            "[lazyWithRetry] retry failed — forcing reload to pick up new build",
          );
          window.location.reload();
          // Return a placeholder while the reload happens
          return { default: (() => null) as unknown as T };
        }

        // We've already reloaded once this session — surface the error
        // so Sentry can capture it instead of looping forever.
        throw err2;
      }
    }
  });
}

/**
 * Global listener for chunk-load errors that escape React's render tree
 * (e.g. Sentry's own lazy modules, or our own dynamic imports outside
 * of React.lazy). Call once from main.tsx after Sentry init.
 *
 * Same retry-once-then-reload strategy as lazyWithRetry.
 */
export function installGlobalChunkErrorHandler(): void {
  const handler = (msg: string) => {
    if (!msg.includes("Failed to fetch dynamically imported module")
      && !msg.includes("Loading chunk")
      && !msg.includes("Importing a module script failed")) {
      return;
    }
    const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG);
    if (alreadyReloaded) return; // don't loop
    sessionStorage.setItem(RELOAD_FLAG, "1");
    console.warn("[globalChunkErrorHandler] stale chunk detected, reloading…");
    setTimeout(() => window.location.reload(), 100);
  };

  window.addEventListener("error", (event) => {
    handler(event.message ?? "");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      typeof reason === "string"
        ? reason
        : reason instanceof Error
          ? reason.message
          : "";
    handler(message);
  });
}

/** Reset the reload flag — call after a successful page render. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}
