/**
 * hasValidServiceToken · CS-01
 *
 * ADMIN_SECRET se filtró en bundles antiguos del cliente como VITE_ADMIN_SECRET
 * (src/hooks/useAdminOrgs.ts). Hasta este cambio seguía siendo token de servicio
 * válido en withHandler (serviceOnly + allowServiceToken → se salta la propiedad
 * de datos de menores y el rate limit). Ahora:
 *   - ADMIN_SECRET NO se acepta en ningún sitio;
 *   - CRON_SECRET / INTERNAL_API_TOKEN / SUPABASE_SERVICE_ROLE_KEY siguen valiendo;
 *   - la comparación sigue siendo en tiempo constante.
 * Además, guards de repo: nadie vuelve a leer ADMIN_SECRET y ningún workflow de CI
 * resiembra la base de conocimiento de producción en push (CS-12).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative, extname, basename } from "node:path";

vi.mock("../rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, limit: 30, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Un token de servicio NO es un JWT de usuario: verifyAuth lo rechaza.
vi.mock("../auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: null, email: null, tenantId: null, error: "Token inválido" }),
}));

import { hasValidServiceToken, constantTimeEqual, withHandler } from "../withHandler";
import { checkRateLimit } from "../rateLimit";

const LEAKED_ADMIN = "admin-secret-leaked-in-old-bundle";
const CRON = "cron-secret-value";
const INTERNAL = "internal-api-token-value";
const SERVICE_ROLE = "supabase-service-role-value";

const withBearer = (token: string | null, scheme = "Bearer") =>
  new Request("https://example.com/api/test", {
    method: "GET",
    headers: token === null ? {} : { Authorization: `${scheme} ${token}` },
  });

const ok = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

describe("hasValidServiceToken · ADMIN_SECRET retirado (CS-01)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29, limit: 30, resetAt: Date.now() + 60000 });
    process.env.CRON_SECRET = CRON;
    process.env.INTERNAL_API_TOKEN = INTERNAL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    process.env.ADMIN_SECRET = LEAKED_ADMIN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rechaza ADMIN_SECRET aunque esté definido en el entorno (control positivo: CRON_SECRET sí pasa en el mismo entorno)", () => {
    expect(hasValidServiceToken(withBearer(LEAKED_ADMIN))).toBe(false);
    expect(hasValidServiceToken(withBearer(CRON))).toBe(true);
  });

  it("rechaza ADMIN_SECRET también cuando es el ÚNICO secreto definido (no es fallback)", () => {
    delete process.env.CRON_SECRET;
    delete process.env.INTERNAL_API_TOKEN;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(hasValidServiceToken(withBearer(LEAKED_ADMIN))).toBe(false);
  });

  it.each([
    ["CRON_SECRET", CRON],
    ["INTERNAL_API_TOKEN", INTERNAL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE],
  ])("sigue aceptando %s", (_name, token) => {
    expect(hasValidServiceToken(withBearer(token))).toBe(true);
  });

  it("cada token vale solo si su variable está definida", () => {
    delete process.env.INTERNAL_API_TOKEN;
    expect(hasValidServiceToken(withBearer(INTERNAL))).toBe(false);
    expect(hasValidServiceToken(withBearer(CRON))).toBe(true);
  });

  it.each([
    ["sin cabecera", withBearer(null)],
    ["esquema Basic", withBearer(CRON, "Basic")],
    ["Bearer vacío", withBearer("")],
    ["token incorrecto", withBearer("otro-valor")],
    ["prefijo del token", withBearer(CRON.slice(0, -1))],
    ["token con sufijo", withBearer(`${CRON}x`)],
  ])("rechaza %s", (_label, req) => {
    expect(hasValidServiceToken(req)).toBe(false);
  });

  it("una variable vacía nunca casa con un Bearer vacío", () => {
    process.env.CRON_SECRET = "";
    delete process.env.INTERNAL_API_TOKEN;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ADMIN_SECRET;
    expect(hasValidServiceToken(withBearer(""))).toBe(false);
    expect(hasValidServiceToken(withBearer(" "))).toBe(false);
  });

  // ── A través de withHandler (lo que ve un endpoint real) ─────────────────
  it("serviceOnly: ADMIN_SECRET → 403 FORBIDDEN; INTERNAL_API_TOKEN → 200", async () => {
    const handler = withHandler({ serviceOnly: true, method: "GET" }, ok);
    const denied = await handler(withBearer(LEAKED_ADMIN));
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { errorDetail: { code: string } }).errorDetail.code).toBe("FORBIDDEN");
    const allowed = await handler(withBearer(INTERNAL));
    expect(allowed.status).toBe(200);
  });

  it("allowServiceToken + requireAuth: ADMIN_SECRET ya no es llamada de servicio (401); CRON_SECRET sí", async () => {
    const seen: boolean[] = [];
    const handler = withHandler(
      { requireAuth: true, allowServiceToken: true, method: "GET" },
      async ({ isServiceCall }) => {
        seen.push(isServiceCall);
        return ok();
      },
    );
    const denied = await handler(withBearer(LEAKED_ADMIN));
    expect(denied.status).toBe(401);
    const allowed = await handler(withBearer(CRON));
    expect(allowed.status).toBe(200);
    expect(seen).toEqual([true]); // solo la de CRON_SECRET llegó al handler, como servicio
  });

  it("ADMIN_SECRET ya no se salta el rate limit; CRON_SECRET sí", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, limit: 30, resetAt: Date.now() + 60000 });
    const handler = withHandler({ serviceOnly: true, method: "GET" }, ok);
    expect((await handler(withBearer(LEAKED_ADMIN))).status).toBe(429);
    expect((await handler(withBearer(CRON))).status).toBe(200);
  });
});

describe("constantTimeEqual · la comparación sigue siendo en tiempo constante", () => {
  it("resultado correcto", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("ab", "abc")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
    expect(constantTimeEqual("ñandú-€", "ñandú-€")).toBe(true);
    expect(constantTimeEqual("ñandú-€", "ñandu-€")).toBe(false);
  });

  it("hasValidServiceToken compara con constantTimeEqual, sin === ni cortocircuito, y sin ADMIN_SECRET", () => {
    const src = readFileSync(resolve(__dirname, "../withHandler.ts"), "utf8").replace(/\r\n/g, "\n");
    const start = src.indexOf("export function hasValidServiceToken(");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf("\n}\n", start);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    // control positivo: el cuerpo extraído es el correcto
    expect(body).toContain("process.env.CRON_SECRET");
    expect(body).toContain("constantTimeEqual(token, s)");
    expect(body).not.toMatch(/token\s*[!=]==|[!=]==\s*token/);
    expect(body).not.toMatch(/\.some\(|\.find\(|\.includes\(token/);
    expect(body).not.toContain("ADMIN_SECRET");
  });
});

// ── Guards de repo ────────────────────────────────────────────────────────
const ROOT = resolve(__dirname, "../../..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "__tests__", "__pycache__", ".venv", "venv", "public", "docs", "fixtures", ".claude"]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sh", ".py", ".yml", ".yaml", ".json"]);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (CODE_EXT.has(extname(name)) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const SCANNED = ["api", "src", "scripts", "vision-pipeline", "eval", "e2e", ".github"].flatMap((d) => walk(join(ROOT, d)));

/** Lecturas de una variable de entorno en TS/JS, shell, Python o GitHub Actions. */
function envReadPattern(name: string): RegExp {
  return new RegExp(
    [
      `process\\.env(?:\\.|\\[\\s*["'\`])${name}\\b`,
      `import\\.meta\\.env\\.(?:VITE_)?${name}\\b`,
      `(?:optional|required)\\(\\s*["'\`]${name}["'\`]`,
      `\\$\\{?${name}\\b`,
      `secrets\\.${name}\\b`,
      `os\\.environ(?:\\.get\\(|\\[)\\s*["']${name}["']`,
      `os\\.getenv\\(\\s*["']${name}["']`,
    ].join("|"),
  );
}

function filesReading(name: string): string[] {
  const re = envReadPattern(name);
  return SCANNED.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f).replace(/\\/g, "/"));
}

describe("guard de repo · nadie vuelve a leer ADMIN_SECRET", () => {
  it("control positivo: el mismo escáner encuentra CRON_SECRET en withHandler.ts y en scripts/seed-rag.sh", () => {
    expect(SCANNED.length).toBeGreaterThan(50);
    const hits = filesReading("CRON_SECRET");
    expect(hits).toContain("api/_lib/withHandler.ts");
    expect(hits).toContain("scripts/seed-rag.sh");
  });

  it("control positivo del patrón: detecta las formas de lectura", () => {
    const re = envReadPattern("ADMIN_SECRET");
    for (const sample of [
      "process.env.ADMIN_SECRET",
      "process.env['ADMIN_SECRET']",
      "import.meta.env.VITE_ADMIN_SECRET",
      'optional("ADMIN_SECRET")',
      'SECRET="${CRON_SECRET:-${ADMIN_SECRET:-}}"',
      "${{ secrets.ADMIN_SECRET }}",
      'os.environ.get("ADMIN_SECRET")',
    ]) {
      expect(re.test(sample)).toBe(true);
    }
    expect(re.test("// ADMIN_SECRET retirado (CS-01)")).toBe(false);
  });

  it("ningún fichero de código (api, src, scripts, vision-pipeline, eval, e2e, .github) lee ADMIN_SECRET", () => {
    expect(filesReading("ADMIN_SECRET")).toEqual([]);
  });

  it(".env.example ya no define ADMIN_SECRET (control positivo: sí define CRON_SECRET)", () => {
    const envExample = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(envExample).toMatch(/^CRON_SECRET=/m);
    expect(envExample).not.toMatch(/^\s*ADMIN_SECRET\s*=/m);
    expect(envExample).not.toMatch(/^\s*VITE_ADMIN_SECRET\s*=/m);
  });
});

/** Triggers del bloque `on:` de un workflow de GitHub Actions (parser de texto mínimo). */
function workflowTriggers(yml: string): string[] {
  const lines = yml.replace(/\r\n/g, "\n").split("\n");
  const i = lines.findIndex((l) => /^["']?on["']?\s*:/.test(l));
  if (i < 0) return [];
  const inline = lines[i].replace(/^["']?on["']?\s*:\s*/, "").replace(/#.*$/, "").trim();
  if (inline) return inline.replace(/[[\]\s]/g, "").split(",").filter(Boolean);
  const triggers: string[] = [];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (/^\S/.test(l)) break; // siguiente clave de primer nivel
    const m = /^ {2}([a-z_]+)\s*:/.exec(l);
    if (m) triggers.push(m[1]);
  }
  return triggers;
}

describe("guard de repo · el seed del RAG nunca corre solo en CI (CS-12)", () => {
  const wfDir = join(ROOT, ".github", "workflows");
  const workflows = readdirSync(wfDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ name: f, text: readFileSync(join(wfDir, f), "utf8") }));
  const seeds = (text: string) => /\/api\/rag\/seed|seed-rag\.sh/.test(text);

  it("control positivo: el parser lee los triggers de ci.yml (push + pull_request)", () => {
    const ci = workflows.find((w) => w.name === "ci.yml");
    expect(ci).toBeDefined();
    expect(workflowTriggers(ci!.text)).toEqual(expect.arrayContaining(["push", "pull_request"]));
  });

  it("existe el workflow manual rag-seed.yml y siembra vía scripts/seed-rag.sh", () => {
    const manual = workflows.find((w) => w.name === "rag-seed.yml");
    expect(manual).toBeDefined();
    expect(seeds(manual!.text)).toBe(true);
    expect(manual!.text).toContain("BORRAR-Y-RESEMBRAR");
  });

  it("todo workflow que siembra el RAG es SOLO workflow_dispatch", () => {
    const seeding = workflows.filter((w) => seeds(w.text));
    expect(seeding.length).toBeGreaterThan(0);
    for (const w of seeding) {
      expect({ file: w.name, triggers: workflowTriggers(w.text) }).toEqual({ file: w.name, triggers: ["workflow_dispatch"] });
    }
  });

  it("ci.yml ya no siembra el RAG ni usa la service_role de Supabase como Bearer", () => {
    const ci = workflows.find((w) => w.name === "ci.yml")!;
    expect(seeds(ci.text)).toBe(false);
    expect(ci.text).not.toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
  });

  it("scripts/seed-rag.sh ya no se traga los fallos (sale con código ≠ 0)", () => {
    const sh = readFileSync(join(ROOT, "scripts", "seed-rag.sh"), "utf8");
    expect(basename(join(ROOT, "scripts", "seed-rag.sh"))).toBe("seed-rag.sh");
    expect(sh).toMatch(/exit "\$FAILED"/);
    expect(sh).toContain("d.indexed === total");
  });
});
