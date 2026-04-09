/**
 * VITAS · Tests — PushNotificationService
 * Verifica: isSupported, requestPermission, subscribe, unsubscribe, getPermission
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock setup antes del import ──────────────────────────────────────────────

// Mock import.meta.env
vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "BNq7xrE0FeH-X0EXdWzqg9CHPTz6MN0Iv2C0-R1rP3AjEo8eBDOGDwHCzlJ9gEdXmajsv2nN87PJxfkG8FPssQ0");

// Mock para @/lib/supabase (usado dentro del service)
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
  SUPABASE_CONFIGURED: false,
}));

import { PushNotificationService } from "@/services/real/pushNotificationService";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockPushAPIs() {
  const mockSubscription = {
    endpoint: "https://push.example.com/sub1",
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint: "https://push.example.com/sub1" }),
  };

  const mockPushManager = {
    getSubscription: vi.fn(async () => null),
    subscribe: vi.fn(async () => mockSubscription),
  };

  const mockRegistration = {
    pushManager: mockPushManager,
    showNotification: vi.fn(),
  };

  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      ready: Promise.resolve(mockRegistration),
      register: vi.fn(),
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, "PushManager", {
    value: class PushManager {},
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, "Notification", {
    value: Object.assign(vi.fn(), {
      permission: "default" as NotificationPermission,
      requestPermission: vi.fn(async () => "granted" as NotificationPermission),
    }),
    writable: true,
    configurable: true,
  });

  // Mock fetch for subscribe/unsubscribe calls
  globalThis.fetch = vi.fn(async () => new Response("ok"));

  return { mockSubscription, mockPushManager, mockRegistration };
}

function removePushAPIs() {
  Object.defineProperty(navigator, "serviceWorker", {
    value: undefined,
    writable: true,
    configurable: true,
  });
  // @ts-ignore
  delete (window as any).PushManager;
  // @ts-ignore
  delete (window as any).Notification;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PushNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isSupported", () => {
    it("retorna true cuando APIs están disponibles", () => {
      mockPushAPIs();
      expect(PushNotificationService.isSupported()).toBe(true);
    });

    it("retorna false cuando APIs no están disponibles", () => {
      removePushAPIs();
      expect(PushNotificationService.isSupported()).toBe(false);
    });
  });

  describe("getPermission", () => {
    afterEach(() => removePushAPIs());

    it("retorna permiso actual cuando APIs disponibles", async () => {
      mockPushAPIs();
      (window.Notification as any).permission = "granted";
      const permission = await PushNotificationService.getPermission();
      expect(permission).toBe("granted");
    });

    it("retorna denied cuando APIs no disponibles", async () => {
      removePushAPIs();
      const permission = await PushNotificationService.getPermission();
      expect(permission).toBe("denied");
    });
  });

  describe("requestPermission", () => {
    afterEach(() => removePushAPIs());

    it("llama a Notification.requestPermission", async () => {
      mockPushAPIs();
      const result = await PushNotificationService.requestPermission();
      expect(Notification.requestPermission).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("retorna false cuando permiso denegado", async () => {
      mockPushAPIs();
      (Notification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce("denied");
      const result = await PushNotificationService.requestPermission();
      expect(result).toBe(false);
    });

    it("retorna false cuando APIs no disponibles", async () => {
      removePushAPIs();
      const result = await PushNotificationService.requestPermission();
      expect(result).toBe(false);
    });
  });

  describe("subscribe", () => {
    afterEach(() => removePushAPIs());

    it("crea push subscription", async () => {
      const { mockPushManager } = mockPushAPIs();
      const sub = await PushNotificationService.subscribe();
      expect(mockPushManager.subscribe).toHaveBeenCalled();
      expect(sub).not.toBeNull();
      expect(sub?.endpoint).toBe("https://push.example.com/sub1");
    });

    it("retorna subscription existente si ya hay una", async () => {
      const { mockPushManager, mockSubscription } = mockPushAPIs();
      mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);
      const sub = await PushNotificationService.subscribe();
      expect(mockPushManager.subscribe).not.toHaveBeenCalled();
      expect(sub?.endpoint).toBe("https://push.example.com/sub1");
    });
  });

  describe("unsubscribe", () => {
    afterEach(() => removePushAPIs());

    it("remueve subscription existente", async () => {
      const { mockPushManager, mockSubscription } = mockPushAPIs();
      mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);
      const result = await PushNotificationService.unsubscribe();
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("retorna true incluso sin subscription activa", async () => {
      mockPushAPIs();
      const result = await PushNotificationService.unsubscribe();
      expect(result).toBe(true);
    });
  });
});
