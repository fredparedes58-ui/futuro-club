/**
 * Stripe Webhook — E2E Tests
 *
 * Verifica el pipeline completo de Stripe webhook:
 *   1. Firma inválida → 400
 *   2. Stripe no configurado → 500
 *   3. checkout.session.completed → upsert plan activo en subscriptions
 *   4. customer.subscription.updated → actualiza plan y status
 *   5. customer.subscription.deleted → degrada a free/canceled
 *   6. Evento sin userId metadata → received pero sin cambios DB
 *   7. Resolución de priceId → pro vs club
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock withHandler to bypass rate limit / CORS / auth layers
vi.mock("../withHandler", () => ({
  withHandler: (_opts: unknown, handler: (ctx: {
    req: Request; body: unknown; ip: string; userId: string | null;
  }) => Promise<Response>) => {
    return async (req: Request) => handler({
      req,
      body: undefined,
      ip: "127.0.0.1",
      userId: null,
    });
  },
}));

// Mock email (non-blocking — webhook doesn't wait)
vi.mock("../email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../emailTemplates", () => ({
  paymentConfirmEmail: vi.fn((plan: string, amount: string) =>
    `<html>Pago ${plan} ${amount}</html>`),
  planCancelledEmail: vi.fn((plan: string) => `<html>Cancelled ${plan}</html>`),
}));

// Mock Supabase client
const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

// Mock Stripe SDK
const mockConstructEventAsync = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockCustomersRetrieve = vi.fn();

vi.mock("stripe", () => {
  function StripeMock() {
    return {
      webhooks: { constructEventAsync: mockConstructEventAsync },
      subscriptions: { retrieve: mockSubscriptionsRetrieve },
      customers: { retrieve: mockCustomersRetrieve },
    };
  }
  return { default: StripeMock };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWebhookRequest(payload: string, sig = "t=1,v1=fake"): Request {
  return new Request("https://example.com/api/stripe/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": sig,
      "content-type": "application/json",
    },
    body: payload,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Stripe Webhook — E2E", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ data: null, error: null });
    mockFrom.mockImplementation(() => ({ upsert: mockUpsert }));

    // Config ENV para que el webhook proceda
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    process.env.VITE_SUPABASE_URL = "https://fake.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_fake";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_123";
    process.env.STRIPE_CLUB_PRICE_ID = "price_club_456";
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("validación inicial", () => {
    it("rechaza request sin stripe-signature header (400)", async () => {
      const { default: handler } = await import("../../stripe/_webhook");
      const req = new Request("https://example.com/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
      const body = await res.json() as { error?: string };
      expect(body.error).toContain("stripe-signature");
    });

    it("devuelve 500 si Stripe no está configurado", async () => {
      process.env.STRIPE_SECRET_KEY = "REEMPLAZA_CON_TU_KEY";
      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));
      expect(res.status).toBe(500);
    });

    it("rechaza firma inválida (400)", async () => {
      mockConstructEventAsync.mockRejectedValueOnce(new Error("Invalid signature"));
      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest('{"type":"foo"}'));
      expect(res.status).toBe(400);
      const body = await res.json() as { error?: string };
      expect(body.error).toContain("signature");
    });
  });

  describe("checkout.session.completed", () => {
    it("upsert plan pro cuando priceId = PRO price", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { userId: "user-pro-1" },
            subscription: "sub_123",
            customer: "cus_456",
            customer_details: { email: "user@test.com" },
            amount_total: 2999,
          },
        },
      });
      mockSubscriptionsRetrieve.mockResolvedValueOnce({
        id: "sub_123",
        status: "active",
        items: { data: [{ price: { id: "price_pro_123" } }] },
        current_period_end: 1800000000,
      });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));

      expect(res.status).toBe(200);
      expect(mockFrom).toHaveBeenCalledWith("subscriptions");
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.user_id).toBe("user-pro-1");
      expect(upsertArg.plan).toBe("pro");
      expect(upsertArg.status).toBe("active");
      expect(upsertArg.stripe_customer_id).toBe("cus_456");
      expect(upsertArg.stripe_subscription_id).toBe("sub_123");
    });

    it("upsert plan club cuando priceId = CLUB price", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { userId: "user-club-1" },
            subscription: "sub_789",
            customer: "cus_999",
            customer_details: { email: "club@test.com" },
            amount_total: 9999,
          },
        },
      });
      mockSubscriptionsRetrieve.mockResolvedValueOnce({
        id: "sub_789",
        status: "active",
        items: { data: [{ price: { id: "price_club_456" } }] },
        current_period_end: 1800000000,
      });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));

      expect(res.status).toBe(200);
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.plan).toBe("club");
    });

    it("no upsert si falta userId en metadata", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: {},
            subscription: "sub_anon",
            customer: "cus_anon",
          },
        },
      });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));

      expect(res.status).toBe(200);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("respuesta incluye received:true", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { userId: "u1" },
            subscription: "sub_1",
            customer: "c_1",
            customer_details: { email: "a@b.com" },
            amount_total: 1000,
          },
        },
      });
      mockSubscriptionsRetrieve.mockResolvedValueOnce({
        id: "sub_1",
        status: "active",
        items: { data: [{ price: { id: "price_pro_123" } }] },
        current_period_end: 1800000000,
      });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));
      const body = await res.json() as { data?: { received?: boolean } };
      expect(body.data?.received).toBe(true);
    });
  });

  describe("customer.subscription.updated", () => {
    it("actualiza plan y status en DB", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_upd",
            status: "past_due",
            metadata: { userId: "user-upd-1" },
            items: { data: [{ price: { id: "price_pro_123" } }] },
            current_period_end: 1900000000,
          },
        },
      });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));

      expect(res.status).toBe(200);
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.user_id).toBe("user-upd-1");
      expect(upsertArg.plan).toBe("pro");
      expect(upsertArg.status).toBe("past_due");
      expect(upsertArg.stripe_subscription_id).toBe("sub_upd");
    });
  });

  describe("customer.subscription.deleted", () => {
    it("degrada a plan free con status canceled", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_del",
            customer: "cus_del",
            metadata: { userId: "user-del-1" },
            items: { data: [{ price: { id: "price_pro_123" } }] },
          },
        },
      });
      mockCustomersRetrieve.mockResolvedValueOnce({
        deleted: false,
        email: "cancel@test.com",
      });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));

      expect(res.status).toBe(200);
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.plan).toBe("free");
      expect(upsertArg.status).toBe("canceled");
      expect(upsertArg.current_period_end).toBe(null);
    });

    it("no crashea si cliente Stripe ya fue borrado", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_x",
            customer: "cus_x",
            metadata: { userId: "user-x" },
            items: { data: [{ price: { id: "price_pro_123" } }] },
          },
        },
      });
      mockCustomersRetrieve.mockResolvedValueOnce({ deleted: true });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));

      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalled();
    });
  });

  describe("eventos desconocidos", () => {
    it("devuelve 200 para tipo de evento no manejado", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "invoice.payment_succeeded",
        data: { object: {} },
      });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));

      expect(res.status).toBe(200);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe("resolución de priceId", () => {
    it("priceId desconocido → fallback a plan pro", async () => {
      mockConstructEventAsync.mockResolvedValueOnce({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { userId: "u-unknown" },
            subscription: "sub_u",
            customer: "cus_u",
            customer_details: { email: "u@test.com" },
            amount_total: 500,
          },
        },
      });
      mockSubscriptionsRetrieve.mockResolvedValueOnce({
        id: "sub_u",
        status: "active",
        items: { data: [{ price: { id: "price_unknown_xxx" } }] },
        current_period_end: 1800000000,
      });

      const { default: handler } = await import("../../stripe/_webhook");
      const res = await handler(makeWebhookRequest("{}"));

      expect(res.status).toBe(200);
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.plan).toBe("pro");
    });
  });
});
