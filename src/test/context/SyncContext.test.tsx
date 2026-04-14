/**
 * Tests for SyncContext — verifies that SyncProvider exposes sync state correctly.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncProvider, useSyncState } from "@/context/SyncContext";

// Mock useSupabaseSync to control the state
const mockState = {
  syncing: false,
  pending: 3,
  online: true,
  lastSync: "2026-01-01T00:00:00Z",
  error: null as string | null,
};

vi.mock("@/hooks/useSupabaseSync", () => ({
  useSupabaseSync: () => mockState,
}));

// Simple consumer component for testing
function SyncConsumer() {
  const state = useSyncState();
  return (
    <div>
      <span data-testid="online">{String(state.online)}</span>
      <span data-testid="pending">{state.pending}</span>
      <span data-testid="syncing">{String(state.syncing)}</span>
    </div>
  );
}

describe("SyncContext", () => {
  it("SyncProvider renders children", () => {
    render(
      <SyncProvider>
        <span>child content</span>
      </SyncProvider>,
    );
    expect(screen.getByText("child content")).toBeTruthy();
  });

  it("useSyncState returns state from useSupabaseSync", () => {
    render(
      <SyncProvider>
        <SyncConsumer />
      </SyncProvider>,
    );
    expect(screen.getByTestId("online").textContent).toBe("true");
    expect(screen.getByTestId("pending").textContent).toBe("3");
    expect(screen.getByTestId("syncing").textContent).toBe("false");
  });

  it("useSyncState works without SyncProvider (returns defaults)", () => {
    render(<SyncConsumer />);
    // Default context value: online=true, pending=0
    expect(screen.getByTestId("online").textContent).toBe("true");
  });
});
