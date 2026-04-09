import { initSentry } from "./lib/sentry";
import { createRoot } from "react-dom/client";
import "./i18n"; // Initialize i18n before App renders
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry before rendering (noop if VITE_SENTRY_DSN not set)
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
