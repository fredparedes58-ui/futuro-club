/**
 * VITAS · Sentry Integration
 * Monitoring de errores y performance en producción.
 *
 * Para activar:
 * 1. Crear proyecto en sentry.io
 * 2. Agregar VITE_SENTRY_DSN a .env y Vercel env vars
 * 3. (Opcional) Agregar SENTRY_AUTH_TOKEN para source maps en CI
 */
import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!DSN) {
    if (import.meta.env.DEV) {
      console.log("[Sentry] No DSN configured — skipping initialization");
    }
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE, // "development" | "production"

    // Performance monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    // Sample rates
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Filter out noise
    beforeSend(event) {
      // Don't send errors from extensions or third-party scripts
      if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
        (f) => f.filename?.includes("extension://")
      )) {
        return null;
      }
      return event;
    },

    // Tags
    initialScope: {
      tags: {
        app: "vitas",
        version: import.meta.env.VITE_APP_VERSION ?? "dev",
      },
    },
  });
}

export { Sentry };
