#!/usr/bin/env node
/**
 * diag-jwt-tenant.mjs — Diagnóstico del hook `custom_access_token_hook` (migración 057).
 *
 * Verifica la cadena que activa la RLS multi-tenant de datos de menores:
 *   app_metadata.tenant_id  --(hook)-->  claim RAÍZ tenant_id  --(RLS)-->  public.tenant_id()
 *
 * QUÉ COMPRUEBA (solo lectura, nunca muta nada):
 *   1) PRECONDICIÓN (siempre): cuántos usuarios tienen `app_metadata.tenant_id`
 *      (la fuente que el hook copia). Requiere SUPABASE_SERVICE_ROLE_KEY.
 *   2) DEFINITIVO (opcional): inicia sesión con una cuenta REAL que tú indiques por
 *      env, decodifica el access_token emitido por GoTrue (con el hook aplicado si
 *      está activo) y comprueba si el claim RAÍZ `tenant_id` está presente. Esta parte
 *      requiere una contraseña → NO se pide interactivamente; se pasa por env solo si
 *      tú quieres la confirmación end-to-end.
 *
 * SEGURIDAD: no imprime la service_role key, ni tokens, ni datos personales — solo
 * conteos agregados y un veredicto. Salidas: 0 OK/precondición ok · 1 PARCIAL · 2 falta config.
 *
 * USO:
 *   node --env-file=.env.production.local scripts/diag-jwt-tenant.mjs
 *   # confirmación definitiva del claim raíz (cuenta real tuya):
 *   DIAG_TEST_EMAIL=tu@correo DIAG_TEST_PASSWORD=tu_pass \
 *     node --env-file=.env.production.local scripts/diag-jwt-tenant.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

class Fatal extends Error {}

async function main() {
  if (!url) throw new Fatal("VITE_SUPABASE_URL / SUPABASE_URL no está en el entorno.");
  if (!serviceKey) throw new Fatal("SUPABASE_SERVICE_ROLE_KEY no está en el entorno.");

  const svc = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1) PRECONDICIÓN: usuarios con app_metadata.tenant_id ─────────────────────
  let page = 1;
  let total = 0;
  let withTenant = 0;
  for (;;) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Fatal(`listUsers falló: ${error.message}`);
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      total++;
      const t = u.app_metadata?.tenant_id;
      if (t != null && String(t) !== "") withTenant++;
    }
    if (users.length < 200) break;
    page++;
  }
  const without = total - withTenant;

  console.log("── Precondición (fuente que copia el hook) ──");
  console.log(`Usuarios con app_metadata.tenant_id: ${withTenant}/${total}`);
  if (without > 0) {
    console.log(
      `⚠ ${without} usuario(s) SIN tenant_id → tras activar el hook NO verán sus datos por lectura directa (RLS fail-closed, correcto pero notable).`,
    );
  }

  // ── 2) DEFINITIVO (opcional): claim raíz en un token real ────────────────────
  const email = process.env.DIAG_TEST_EMAIL;
  const pass = process.env.DIAG_TEST_PASSWORD;

  console.log("\n── Claim RAÍZ tenant_id (efecto del hook) ──");
  if (!email || !pass) {
    console.log("[PARCIAL] No probado el token emitido (falta DIAG_TEST_EMAIL/DIAG_TEST_PASSWORD de una cuenta REAL).");
    console.log("Confirmación definitiva: reloguea en la app y decodifica el access_token, o corre este script con esas dos env de una cuenta tuya.");
    return 0;
  }
  if (!anonKey) throw new Fatal("VITE_SUPABASE_ANON_KEY no está en el entorno (necesaria para el login de prueba).");

  const pub = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signErr } = await pub.auth.signInWithPassword({ email, password: pass });
  if (signErr) {
    console.error(`[?] No se pudo iniciar sesión con la cuenta de prueba: ${signErr.message}`);
    return 1;
  }
  const jwt = signIn.session?.access_token;
  if (!jwt) {
    console.error("[?] Login sin access_token.");
    return 1;
  }
  // Decodifica SOLO el payload (base64url); no verificamos firma ni imprimimos el token.
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
  await pub.auth.signOut();

  const rootTenant = payload.tenant_id;
  const metaTenant = payload.app_metadata?.tenant_id;
  console.log(`tenant_id en app_metadata del token: ${metaTenant != null && metaTenant !== "" ? "sí" : "no"}`);
  console.log(`tenant_id en la RAÍZ del token:      ${rootTenant != null && rootTenant !== "" ? "sí" : "no"}`);

  if (rootTenant != null && String(rootTenant) !== "") {
    console.log("\n[OK] El hook está ACTIVO → public.tenant_id() leerá el claim raíz → RLS multi-tenant operativa.");
    return 0;
  }
  console.log("\n[PARCIAL] El claim raíz tenant_id NO está presente → el hook NO está activado (o el token es previo).");
  console.log("Actívalo: Supabase → Authentication → Hooks → 'Customize Access Token (JWT) Claims' → public.custom_access_token_hook → Enable.");
  return 1;
}

// process.exitCode (no process.exit) para dejar drenar el event loop → evita la
// assertion de libuv en Windows/Node 25 al cerrar con handles abiertos.
main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    if (err instanceof Fatal) console.error(`[FALTA] ${err.message}`);
    else console.error(`[ERROR] ${err?.message ?? err}`);
    process.exitCode = 2;
  });
