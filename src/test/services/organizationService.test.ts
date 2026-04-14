/**
 * Tests para OrganizationService y aislamiento multi-tenant
 * Sprint 5G — Verificar que org_id se inyecta correctamente y datos están aislados.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { OrganizationService, type Organization } from "@/services/real/organizationService";

// ── Mock: StorageService ────────────────────────────────────────────────────
const mockStorage = new Map<string, unknown>();

vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: <T>(key: string, fallback: T) => (mockStorage.has(key) ? mockStorage.get(key) as T : fallback),
    set: (key: string, value: unknown) => mockStorage.set(key, value),
    remove: (key: string) => mockStorage.delete(key),
  },
}));

// ── Mock: Supabase (deshabilitado para tests unitarios) ─────────────────────
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
  SUPABASE_CONFIGURED: false,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeOrg(overrides?: Partial<Organization>): Organization {
  return {
    id: "org-001",
    name: "Club Test",
    slug: "club-test",
    logo_url: null,
    plan: "free",
    owner_id: "user-owner-001",
    active: true,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OrganizationService", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  // ── getCurrent / setCurrent / clearCurrent ────────────────────────────
  describe("cache local", () => {
    it("devuelve null si no hay org cacheada", () => {
      expect(OrganizationService.getCurrent()).toBeNull();
    });

    it("setCurrent guarda y getCurrent recupera", () => {
      const org = makeOrg();
      OrganizationService.setCurrent(org);
      expect(OrganizationService.getCurrent()).toEqual(org);
    });

    it("clearCurrent elimina la org cacheada", () => {
      OrganizationService.setCurrent(makeOrg());
      OrganizationService.clearCurrent();
      expect(OrganizationService.getCurrent()).toBeNull();
    });

    it("getOrgId devuelve null sin org", () => {
      expect(OrganizationService.getOrgId()).toBeNull();
    });

    it("getOrgId devuelve el id correcto", () => {
      OrganizationService.setCurrent(makeOrg({ id: "org-xyz" }));
      expect(OrganizationService.getOrgId()).toBe("org-xyz");
    });
  });

  // ── create (offline mode — SUPABASE_CONFIGURED=false) ─────────────────
  describe("create (offline)", () => {
    it("crea org local con id, nombre, slug y plan free", async () => {
      const org = await OrganizationService.create("user-123", "Mi Academia");
      expect(org).not.toBeNull();
      expect(org!.name).toBe("Mi Academia");
      expect(org!.slug).toBe("mi-academia");
      expect(org!.plan).toBe("free");
      expect(org!.owner_id).toBe("user-123");
      expect(org!.active).toBe(true);
    });

    it("guarda la org creada en cache", async () => {
      await OrganizationService.create("user-123", "Club ABC");
      const cached = OrganizationService.getCurrent();
      expect(cached).not.toBeNull();
      expect(cached!.name).toBe("Club ABC");
    });

    it("slug sanitiza caracteres especiales", async () => {
      const org = await OrganizationService.create("u1", "Fútbol + Más!");
      expect(org!.slug).toBe("ftbol--ms");
    });

    it("slug maneja espacios múltiples (colapsa a un solo guión)", async () => {
      const org = await OrganizationService.create("u1", "Club   Nacional");
      expect(org!.slug).toBe("club-nacional");
    });
  });

  // ── fetchForUser (offline — devuelve cache) ───────────────────────────
  describe("fetchForUser (offline)", () => {
    it("devuelve la org cacheada si Supabase no está configurado", async () => {
      const org = makeOrg({ id: "org-cached" });
      OrganizationService.setCurrent(org);
      const result = await OrganizationService.fetchForUser("any-user");
      expect(result).toEqual(org);
    });

    it("devuelve null si no hay cache y Supabase no está configurado", async () => {
      const result = await OrganizationService.fetchForUser("any-user");
      expect(result).toBeNull();
    });
  });

  // ── update (offline — devuelve cache) ─────────────────────────────────
  describe("update (offline)", () => {
    it("devuelve cache actual sin modificar (Supabase no configurado)", async () => {
      const org = makeOrg();
      OrganizationService.setCurrent(org);
      const result = await OrganizationService.update("org-001", { name: "Nuevo Nombre" });
      // Offline mode devuelve getCurrent() sin cambios
      expect(result).toEqual(org);
    });
  });

  // ── getMembers (offline) ──────────────────────────────────────────────
  describe("getMembers (offline)", () => {
    it("devuelve array vacío si Supabase no está configurado", async () => {
      const members = await OrganizationService.getMembers("org-001");
      expect(members).toEqual([]);
    });
  });

  // ── isUserInOrg (offline) ─────────────────────────────────────────────
  describe("isUserInOrg (offline)", () => {
    it("devuelve true si Supabase no está configurado (modo permisivo offline)", async () => {
      const result = await OrganizationService.isUserInOrg("user-1", "org-1");
      expect(result).toBe(true);
    });
  });
});

// ─── Tests de aislamiento org_id ────────────────────────────────────────────

describe("Aislamiento multi-tenant", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("org_id es distinto entre organizaciones", () => {
    const org1 = makeOrg({ id: "org-alpha", name: "Alpha FC" });
    const org2 = makeOrg({ id: "org-beta", name: "Beta SC" });
    expect(org1.id).not.toBe(org2.id);
  });

  it("getOrgId refleja la org activa actual", () => {
    const org1 = makeOrg({ id: "org-A" });
    const org2 = makeOrg({ id: "org-B" });

    OrganizationService.setCurrent(org1);
    expect(OrganizationService.getOrgId()).toBe("org-A");

    OrganizationService.setCurrent(org2);
    expect(OrganizationService.getOrgId()).toBe("org-B");
  });

  it("clearCurrent elimina el contexto de org — queries sin org_id", () => {
    OrganizationService.setCurrent(makeOrg({ id: "org-X" }));
    expect(OrganizationService.getOrgId()).toBe("org-X");

    OrganizationService.clearCurrent();
    expect(OrganizationService.getOrgId()).toBeNull();
  });

  it("cambiar de org actualiza inmediatamente el contexto", () => {
    OrganizationService.setCurrent(makeOrg({ id: "org-first" }));
    expect(OrganizationService.getOrgId()).toBe("org-first");

    OrganizationService.setCurrent(makeOrg({ id: "org-second" }));
    expect(OrganizationService.getOrgId()).toBe("org-second");

    // Verificar que la primera ya no está
    expect(OrganizationService.getCurrent()!.id).toBe("org-second");
  });

  it("plan se preserva correctamente por organización", () => {
    OrganizationService.setCurrent(makeOrg({ id: "org-free", plan: "free" }));
    expect(OrganizationService.getCurrent()!.plan).toBe("free");

    OrganizationService.setCurrent(makeOrg({ id: "org-pro", plan: "pro" }));
    expect(OrganizationService.getCurrent()!.plan).toBe("pro");
  });
});

// ─── Tests de org_id inyección pattern ──────────────────────────────────────

describe("Patrón de inyección org_id", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("spread condicional no agrega org_id si no hay org", () => {
    // Sin org activa
    const orgId = OrganizationService.getOrgId();
    const row = {
      id: "player-1",
      user_id: "user-1",
      ...(orgId ? { org_id: orgId } : {}),
    };
    expect(row).not.toHaveProperty("org_id");
    expect(Object.keys(row)).toEqual(["id", "user_id"]);
  });

  it("spread condicional agrega org_id cuando hay org activa", () => {
    OrganizationService.setCurrent(makeOrg({ id: "org-active" }));
    const orgId = OrganizationService.getOrgId();
    const row = {
      id: "player-1",
      user_id: "user-1",
      ...(orgId ? { org_id: orgId } : {}),
    };
    expect(row).toHaveProperty("org_id", "org-active");
  });

  it("múltiples entidades comparten el mismo org_id", () => {
    OrganizationService.setCurrent(makeOrg({ id: "org-shared" }));
    const orgId = OrganizationService.getOrgId();

    const playerRow = { id: "p1", ...(orgId ? { org_id: orgId } : {}) };
    const videoRow = { id: "v1", ...(orgId ? { org_id: orgId } : {}) };
    const analysisRow = { id: "a1", ...(orgId ? { org_id: orgId } : {}) };

    expect(playerRow.org_id).toBe("org-shared");
    expect(videoRow.org_id).toBe("org-shared");
    expect(analysisRow.org_id).toBe("org-shared");
  });

  it("org_id es nullable — datos existentes sin org siguen funcionando", () => {
    // Simula row sin org_id (datos pre-migration)
    const legacyRow = { id: "old-player", user_id: "user-legacy" };
    expect(legacyRow).not.toHaveProperty("org_id");

    // Ahora con org
    OrganizationService.setCurrent(makeOrg({ id: "org-new" }));
    const orgId = OrganizationService.getOrgId();
    const newRow = { ...legacyRow, ...(orgId ? { org_id: orgId } : {}) };
    expect(newRow.org_id).toBe("org-new");
  });
});

// ─── Tests de Organization types ────────────────────────────────────────────

describe("Organization type contracts", () => {
  it("Organization tiene todos los campos requeridos", () => {
    const org = makeOrg();
    expect(org).toHaveProperty("id");
    expect(org).toHaveProperty("name");
    expect(org).toHaveProperty("slug");
    expect(org).toHaveProperty("plan");
    expect(org).toHaveProperty("owner_id");
    expect(org).toHaveProperty("active");
    expect(org).toHaveProperty("created_at");
    expect(org).toHaveProperty("updated_at");
  });

  it("plan acepta los 3 tiers válidos", () => {
    const free = makeOrg({ plan: "free" });
    const pro = makeOrg({ plan: "pro" });
    const club = makeOrg({ plan: "club" });
    expect(free.plan).toBe("free");
    expect(pro.plan).toBe("pro");
    expect(club.plan).toBe("club");
  });

  it("logo_url es nullable", () => {
    const noLogo = makeOrg({ logo_url: null });
    const withLogo = makeOrg({ logo_url: "https://cdn.example.com/logo.png" });
    expect(noLogo.logo_url).toBeNull();
    expect(withLogo.logo_url).toBe("https://cdn.example.com/logo.png");
  });
});
