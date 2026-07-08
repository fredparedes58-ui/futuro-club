# VITAS · Plan Multi-Categoría (juvenil → profesional)

> **Alcance de producto (Pedro, 2026-07-08):** VITAS evalúa **todas las categorías y
> edades hasta profesional**, no solo juvenil/academia. Hoy casi todo el sistema
> (prompts, golden set, validadores, benchmarks) está enmarcado en academia juvenil.
> Este plan cierra ese gap en 4 sprints. Al cerrarlo, se retoma el roadmap de visión
> (`docs/roadmap-vision-tracking.md`, siguiente: V2).

## Principio de diseño
**Una sola dimensión nueva: `category`** (derivada de la edad, con override explícito),
que module *framing* — no duplicar agentes ni prompts. Mismo patrón que `locale`
(FASE 5): un helper compartido + threading por los inputs que ya existen.

Dos framings, no cinco:
- **`youth`** (en crecimiento, <18 por defecto): aplica PHV, audiencia incluye
  padres/coaches de academia, prohibido lenguaje contractual/económico, énfasis en
  desarrollo y honestidad sobre proyección ("la mayoría no llega a pro").
- **`senior`** (≥18 por defecto, o categoría explícita): SIN PHV (no hay maturity
  offset), audiencia = cuerpo técnico/dirección deportiva, lenguaje de rendimiento
  (no "potencial de desarrollo"), valoración/mercado legítimos donde aplique.

Regla de resolución: `resolveCategory({ age?, category? })` → override explícito gana;
si no, edad <18 → youth, ≥18 → senior; sin datos → youth (conservador: es el framing
más protegido). Nota: un 16-17 en dinámica pro se resuelve con el override.

---

## SPRINT C1 · Fundaciones: helper de categoría + threading  (S)
- **`src/lib/shared/category.ts`** (espejo de `locale.ts`, edge-safe, importable desde
  `api/` y `src/`): `resolveCategory()`, `categoryDirective(category, locale)` → bloque
  de framing para prompts (audiencia, tono, qué NO decir), `phvApplies(category)`.
- **Threading**: `category` opcional en el orchestrator (schema + `sharedContext`,
  igual que `locale`) y en los schemas de los agentes sin passthrough (fatigue,
  injury, valuation — el mismo trío que recortaba `locale`). El cliente lo deriva de
  la edad del jugador (que ya viaja en `playerContext.chronologicalAge`) → en la
  práctica casi ningún caller necesita cambiar: el default por edad resuelve.
- **Tests** del helper (resolución por edad, override, default conservador).
- **Aceptación:** helper testeado; `category` llega a los agentes sin romper nada
  (default youth = comportamiento actual).

## SPRINT C2 · Barrido category-aware de prompts (~15 agentes)  (M)
El impacto profundo. Workflow fan-out (mismo patrón que el barrido de `locale`):
- Cada agente narrativo añade `${categoryDirective(category, locale)}` a su prompt y
  condiciona el framing juvenil: las frases tipo "la mayoría de juveniles NO llegan a
  profesional", "bienestar juvenil", "nota para padres" solo en `youth`.
- **PHV**: los bloques ya son additive-safe (sin datos no se pintan); C2 añade además
  que en `senior` el prompt NO pida razonamiento PHV (evita que el modelo lo invente).
- **Scoring rubric de player-report** ("Proyección+PHV 25%"): en `senior` la dimensión
  pasa a proyección de rendimiento/forma, no maduración. Revisar equivalentes en
  projection/development-plan/valuation.
- **Verificación:** central (build/tsc/eslint) + el eval harness (C3) como red.
- **Aceptación:** con `category: "senior"`, ningún prompt menciona padres/PHV/framing
  juvenil; con `youth` todo queda EXACTO como hoy (default = sin regresión).

## SPRINT C3 · Eval harness multi-categoría  (S)
- **Golden set**: añadir casos **senior/pro** (p.ej. mediocampista de 26 años con
  métricas completas, y un caso pro con datos escasos) junto a los sub-13 actuales.
- **Rulesets por categoría**: los casos pro llevan `skip: ["no_contractual_language"]`
  (en profesional hablar de valor/mercado puede ser legítimo); los youth lo mantienen.
- **Validador nuevo `no_youth_framing`** (para casos senior): caza menciones de
  padres/academia/PHV/"potencial de desarrollo" en reportes de profesionales — el
  espejo del validador contractual.
- **Aceptación:** tests deterministas nuevos en CI (fixtures senior buenos/malos).

## SPRINT C4 · Benchmarks de visión multi-condición  (S de código; bloqueado en clips)
- **Datos (Pedro):** mínimo 2 clips públicos — **academia** (cámara amateur/panning,
  jugadores pequeños en frame) y **profesional/broadcast** (estadio, zoom variable).
- **Código (preparable ya):** runner de benchmark que, dados N clips etiquetados por
  condición, corre n-vs-m (modelo) y ByteTrack-vs-BoT-SORT (tracker) en cada condición
  y saca tabla comparativa (detecciones, tracks, ID-persistencia aproximada).
- **Aceptación:** una tabla por condición; decisión de defaults por categoría si los
  resultados divergen (p.ej. imgsz/conf distintos para broadcast).
- **Nota:** enlaza con V6 del roadmap de visión (golden set CV con ground truth); C4
  es el benchmark comparativo ligero, V6 el eval riguroso con anotaciones.

---

## Resumen

| Sprint | Qué | Esfuerzo | Depende de |
|---|---|---|---|
| **C1** | Helper `category` + threading (patrón locale) | S | — |
| **C2** | Barrido category-aware de ~15 prompts | M | C1 |
| **C3** | Golden set + validadores por categoría | S | C1 (ideal tras C2) |
| **C4** | Benchmarks visión por condición | S código | **clips de Pedro** (academia + pro) |

**Orden:** C1 → C2 → C3 (código, ~1 semana total). C4 en cuanto haya clips (independiente).
**Sin regresión por diseño:** default = `youth` = comportamiento actual exacto; `senior`
solo se activa con edad ≥18 u override.

## Qué NO hace este plan (a propósito)
- No añade columna `category` en BD (se deriva de la edad que ya existe; si producto
  luego quiere categorías finas —infantil/cadete/juvenil/senior— se amplía el helper).
- No toca el tracking de visión (el tracker no distingue edades; solo la condición de
  cámara, que cubre C4).
- No duplica agentes ni crea "modo pro" separado: una dimensión de framing en los
  prompts existentes.
