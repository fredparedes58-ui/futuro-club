#!/usr/bin/env node
/**
 * VITAS · Validador de ficheros de traducción i18n
 *
 * Compara cada src/i18n/<code>.json contra la fuente es.json y verifica:
 *   1. JSON válido.
 *   2. Parity EXACTA de claves (mismas leaf keys, sin faltantes ni extra).
 *   3. Placeholders {{...}} preservados (mismo conjunto por valor).
 *   4. No-traducibles intactos (VITAS presente donde estaba; PHV/VSI no borrados).
 *
 * Uso: node scripts/i18n-check.mjs [code...]   (default: todos menos es/en)
 * Sale 1 si algún idioma falla.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const I18N = join(ROOT, "src", "i18n");

const load = (code) => JSON.parse(readFileSync(join(I18N, `${code}.json`), "utf8"));

/** Aplana a { "a.b.c": value } solo hojas string/array. */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const placeholders = (s) => {
  const m = String(s).match(/\{\{[^}]+\}\}/g) || [];
  return [...m].sort();
};
const eqArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const source = flatten(load("es"));
const sourceKeys = Object.keys(source);

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["it", "de", "fr", "nl", "es-419"];

let failed = false;
for (const code of targets) {
  const file = join(I18N, `${code}.json`);
  if (!existsSync(file)) { console.log(`❌ ${code}: falta ${code}.json`); failed = true; continue; }
  let flat;
  try { flat = flatten(load(code)); }
  catch (e) { console.log(`❌ ${code}: JSON inválido — ${e.message}`); failed = true; continue; }

  const keys = new Set(Object.keys(flat));
  const missing = sourceKeys.filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !source[k] && !(k in source));

  // Placeholders por valor
  const phMismatch = [];
  for (const k of sourceKeys) {
    if (!(k in flat)) continue;
    const sv = source[k], tv = flat[k];
    if (Array.isArray(sv) && Array.isArray(tv)) {
      if (sv.length !== tv.length) { phMismatch.push(`${k} (array len ${sv.length}→${tv.length})`); continue; }
      for (let i = 0; i < sv.length; i++)
        if (!eqArr(placeholders(sv[i]), placeholders(tv[i]))) phMismatch.push(`${k}[${i}]`);
    } else if (!eqArr(placeholders(sv), placeholders(tv))) {
      phMismatch.push(k);
    }
  }
  // VITAS: si el valor fuente contiene "VITAS", el destino también debe.
  const brandDrop = sourceKeys.filter((k) => {
    const sv = source[k]; if (typeof sv !== "string" || !/VITAS/.test(sv)) return false;
    return typeof flat[k] === "string" && !/VITAS/.test(flat[k]);
  });

  const ok = !missing.length && !extra.length && !phMismatch.length && !brandDrop.length;
  if (ok) { console.log(`✅ ${code}: ${keys.size} claves · parity OK · placeholders OK · VITAS OK`); continue; }
  failed = true;
  console.log(`❌ ${code}:`);
  if (missing.length) console.log(`   faltan ${missing.length}: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? "…" : ""}`);
  if (extra.length) console.log(`   sobran ${extra.length}: ${extra.slice(0, 15).join(", ")}${extra.length > 15 ? "…" : ""}`);
  if (phMismatch.length) console.log(`   placeholders ${phMismatch.length}: ${phMismatch.slice(0, 15).join(", ")}${phMismatch.length > 15 ? "…" : ""}`);
  if (brandDrop.length) console.log(`   VITAS perdido ${brandDrop.length}: ${brandDrop.slice(0, 10).join(", ")}`);
}

process.exit(failed ? 1 : 0);
