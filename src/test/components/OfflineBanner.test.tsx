import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OfflineBanner from "@/components/OfflineBanner";

// Track mock sync state so tests can control it
const mockSyncState = {
  syncing: false,
  pending: 0,
  online: true,
  lastSync: null as string | null,
  error: null as string | null,
};

// Mock SyncContext
vi.mock("@/context/SyncContext", () => ({
  useSyncState: () => mockSyncState,
}));

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
  Check: () => <span data-testid="check-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
}));

describe("OfflineBanner", () => {
  beforeEach(() => {
    mockSyncState.syncing = false;
    mockSyncState.pending = 0;
    mockSyncState.online = true;
    mockSyncState.lastSync = null;
    mockSyncState.error = null;
  });

  it("renders nothing when online", () => {
    mockSyncState.online = true;
    const { container } = render(<OfflineBanner />);
    expect(container.textContent).toBe("");
  });

  it("shows offline banner when offline", () => {
    mockSyncState.online = false;
    render(<OfflineBanner />);
    expect(screen.getByText("offline.banner")).toBeTruthy();
  });

  it("shows pending count when offline with pending changes", () => {
    mockSyncState.online = false;
    mockSyncState.pending = 3;
    render(<OfflineBanner />);
    expect(screen.getByText("offline.banner")).toBeTruthy();
    expect(screen.getByText("3 cambios pendientes")).toBeTruthy();
  });

  it("shows syncing state after reconnect", async () => {
    // Start offline
    mockSyncState.online = false;
    const { rerender } = render(<OfflineBanner />);
    expect(screen.getByText("offline.banner")).toBeTruthy();

    // Come back online and syncing
    await act(async () => {
      mockSyncState.online = true;
      mockSyncState.syncing = true;
      rerender(<OfflineBanner />);
    });

    // Should show syncing message
    expect(screen.getByText(/Sincronizando/)).toBeTruthy();
  });

  it("shows reconnected message after sync completes", async () => {
    // Start offline
    mockSyncState.online = false;
    const { rerender } = render(<OfflineBanner />);

    // Come back online, sync complete
    await act(async () => {
      mockSyncState.online = true;
      mockSyncState.syncing = false;
      rerender(<OfflineBanner />);
    });

    expect(screen.getByText("offline.reconnected")).toBeTruthy();
  });
});
