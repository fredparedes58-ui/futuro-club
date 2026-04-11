import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OfflineBanner from "@/components/OfflineBanner";

// Mock react-i18next — t returns the key so we can match on it
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react icons used by OfflineBanner
vi.mock("lucide-react", () => ({
  WifiOff: () => <span data-testid="wifi-off-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  CloudOff: () => <span data-testid="cloud-off-icon" />,
}));

describe("OfflineBanner", () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      writable: true,
      configurable: true,
    });
  });

  it("renders nothing when online", () => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    const { container } = render(<OfflineBanner />);
    expect(container.textContent).toBe("");
  });

  it("shows offline banner when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    render(<OfflineBanner />);
    // t("offline.banner") returns "offline.banner" in tests
    expect(screen.getByText("offline.banner")).toBeTruthy();
  });

  it("responds to offline event", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    render(<OfflineBanner />);

    // Simulate going offline
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("offline.banner")).toBeTruthy();
  });

  it("shows reconnected message on online event", async () => {
    // Start online
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    render(<OfflineBanner />);

    // Go offline first (sets wasOffline = true)
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("offline.banner")).toBeTruthy();

    // Then come back online
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });

    // Should show reconnected message — t("offline.reconnected") = "offline.reconnected"
    const text = screen.queryByText("offline.reconnected");
    expect(text).toBeTruthy();
  });
});
