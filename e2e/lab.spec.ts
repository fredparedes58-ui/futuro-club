/**
 * VITAS E2E — VitasLab smoke test
 *
 * Blinda el refactor del laboratorio (VitasLab.tsx repartido en
 * src/pages/vitasLab/*): comprueba que la página /lab monta sin errores de JS
 * y que los subcomponentes clave se renderizan — el <canvas> del centro
 * (LabPitchView) y la barra de estado (LabStatusBar).
 *
 * /lab está tras ProtectedRoute: con Supabase sin configurar (Fase 1) renderiza
 * directo; si estuviera configurado, redirige a /login. Los tests toleran ambos
 * casos para no ser flaky, pero afirman la UI real cuando el lab es accesible.
 *
 * Nota: /lab es una ruta pesada (lazy chunk + stack de tracking). En dev, Vite la
 * compila on-demand en la primera visita, así que usamos waitUntil "domcontentloaded"
 * (no "load") + esperas explícitas con timeouts amplios, en vez de "networkidle"
 * (que no asienta por los 502 de /api y los workers).
 */
import { test, expect, type Page } from "@playwright/test";

const NAV = { waitUntil: "domcontentloaded" as const, timeout: 60_000 };

/** Espera a que el SPA resuelva /lab: monta el canvas del lab, o redirige a /login. */
async function settleLab(page: Page): Promise<"lab" | "login"> {
  const canvas = page.locator("canvas").first();
  await Promise.race([
    canvas.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {}),
    page.waitForURL(/login/, { timeout: 30_000 }).catch(() => {}),
  ]);
  return page.url().includes("login") ? "login" : "lab";
}

test.describe("VitasLab", () => {
  test("lab page mounts without uncaught JS errors", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (e) => jsErrors.push(e.message));

    await page.goto("/lab", NAV);
    const state = await settleLab(page);

    // ProtectedRoute: renderiza el lab (Supabase off) o redirige a /login. Nunca crashea.
    expect(state === "lab" || state === "login").toBeTruthy();
    // Un fallo de montaje en VitasLab / subcomponentes lanzaría una excepción no capturada.
    // (Los 502 de /api son errores de red/consola, no pageerror → no dan falso positivo.)
    expect(jsErrors).toEqual([]);
  });

  test("lab renders the pitch canvas and station status when accessible", async ({ page }) => {
    await page.goto("/lab", NAV);
    const state = await settleLab(page);

    test.skip(state === "login", "El lab requiere auth en este entorno (Supabase configurado)");

    // Centro (LabPitchView): el canvas de calibración se monta sobre el vídeo/campo.
    await expect(page.locator("canvas").first()).toBeVisible();

    // Barra de estado inferior (LabStatusBar): texto fijo, independiente del idioma.
    await expect(page.getByText(/VITAS_STATION_004/i)).toBeVisible();
  });
});
