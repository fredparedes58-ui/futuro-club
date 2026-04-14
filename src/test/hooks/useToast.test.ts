/**
 * Tests for use-toast.ts — reducer + toast logic
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/hooks/use-toast";

const emptyState = { toasts: [] };

const sampleToast = {
  id: "1",
  title: "Hello",
  open: true,
  onOpenChange: () => {},
};

describe("use-toast reducer", () => {
  // ── ADD_TOAST ────────────────────────────────────────────────────────────────
  describe("ADD_TOAST", () => {
    it("adds a toast to empty state", () => {
      const next = reducer(emptyState, { type: "ADD_TOAST", toast: sampleToast });
      expect(next.toasts).toHaveLength(1);
      expect(next.toasts[0].id).toBe("1");
    });

    it("prepends new toast (newest first)", () => {
      const first = reducer(emptyState, { type: "ADD_TOAST", toast: sampleToast });
      const second = reducer(first, {
        type: "ADD_TOAST",
        toast: { ...sampleToast, id: "2", title: "Second" },
      });
      expect(second.toasts[0].id).toBe("2");
    });

    it("limits toasts to TOAST_LIMIT (1)", () => {
      const first = reducer(emptyState, { type: "ADD_TOAST", toast: sampleToast });
      const second = reducer(first, {
        type: "ADD_TOAST",
        toast: { ...sampleToast, id: "2" },
      });
      // TOAST_LIMIT = 1, so only most recent remains
      expect(second.toasts).toHaveLength(1);
      expect(second.toasts[0].id).toBe("2");
    });
  });

  // ── UPDATE_TOAST ─────────────────────────────────────────────────────────────
  describe("UPDATE_TOAST", () => {
    it("updates existing toast by id", () => {
      const initial = reducer(emptyState, { type: "ADD_TOAST", toast: sampleToast });
      const updated = reducer(initial, {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Updated" },
      });
      expect(updated.toasts[0].title).toBe("Updated");
    });

    it("does not affect other toasts", () => {
      const initial = { toasts: [sampleToast, { ...sampleToast, id: "2", title: "Other" }] };
      const updated = reducer(initial, {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Changed" },
      });
      expect(updated.toasts[1].title).toBe("Other");
    });

    it("no-ops if id not found", () => {
      const initial = reducer(emptyState, { type: "ADD_TOAST", toast: sampleToast });
      const updated = reducer(initial, {
        type: "UPDATE_TOAST",
        toast: { id: "999", title: "Ghost" },
      });
      expect(updated.toasts[0].title).toBe("Hello");
    });
  });

  // ── DISMISS_TOAST ────────────────────────────────────────────────────────────
  describe("DISMISS_TOAST", () => {
    it("sets open=false for specific toast", () => {
      const initial = reducer(emptyState, { type: "ADD_TOAST", toast: sampleToast });
      const dismissed = reducer(initial, { type: "DISMISS_TOAST", toastId: "1" });
      expect(dismissed.toasts[0].open).toBe(false);
    });

    it("dismisses all toasts when no toastId", () => {
      const state = {
        toasts: [
          { ...sampleToast, id: "1", open: true },
          { ...sampleToast, id: "2", open: true },
        ],
      };
      const dismissed = reducer(state, { type: "DISMISS_TOAST" });
      for (const t of dismissed.toasts) {
        expect(t.open).toBe(false);
      }
    });
  });

  // ── REMOVE_TOAST ─────────────────────────────────────────────────────────────
  describe("REMOVE_TOAST", () => {
    it("removes a specific toast by id", () => {
      const state = {
        toasts: [
          { ...sampleToast, id: "1" },
          { ...sampleToast, id: "2" },
        ],
      };
      const removed = reducer(state, { type: "REMOVE_TOAST", toastId: "1" });
      expect(removed.toasts).toHaveLength(1);
      expect(removed.toasts[0].id).toBe("2");
    });

    it("removes all toasts when no id", () => {
      const state = {
        toasts: [
          { ...sampleToast, id: "1" },
          { ...sampleToast, id: "2" },
        ],
      };
      const removed = reducer(state, { type: "REMOVE_TOAST", toastId: undefined });
      expect(removed.toasts).toHaveLength(0);
    });
  });
});
