import { initSentry } from "./lib/sentry";
import { installGlobalChunkErrorHandler, clearChunkReloadFlag } from "./lib/lazyWithRetry";
import { createRoot } from "react-dom/client";
import "./i18n"; // Initialize i18n before App renders
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry before rendering (noop if VITE_SENTRY_DSN not set)
initSentry();

// Catch chunk-load errors from anywhere (Sentry lazy modules, dependencies,
// or our own dynamic imports outside React.lazy boundaries) and recover with
// a one-time reload to fetch the fresh build.
installGlobalChunkErrorHandler();

// Clear the reload flag after a brief delay so a successful render counts
// as recovery. If we crash again the flag stays set and prevents looping.
window.setTimeout(clearChunkReloadFlag, 5000);

createRoot(document.getElementById("root")!).render(<App />);
