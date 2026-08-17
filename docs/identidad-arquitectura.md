# Capa de identidad por dorsal — arquitectura (#25)

> Estado: **DISEÑO**. La implementación que emita identidad NO puede activarse hasta
> que exista `fixtures/identidad/` con ground truth humano (G9.0) contra el que probar
> el ≥98% de precisión. Sin ese conjunto, cualquier número de precisión sería
> inventado. Hasta entonces, toda pista permanece **anónima** (`#1, #2, …`).
> Contrato completo: `.claude/rules/identidad.md`.

## Qué problema es (y qué NO es)

No es OCR abierto. Es **clasificación sobre conjunto cerrado**: la convocatoria del
partido (~18 dorsales por equipo, conocidos). Con **restricción de unicidad**: un
dorsal no está en dos pistas a la vez → la asignación es un **emparejamiento global**,
no una decisión por pista. Tratarlo como OCR libre por frame es lo que hunde la
precisión.

## Pipeline (5 etapas)

```
tracking (ByteTrack) ── pistas + cajas
        │
        ▼
1. RECORTE DE TORSO   caja del tracking → recorte espalda/torso (no frame completo)
        │
        ▼
2. LECTURA POR FRAME  recorte → distribución de probabilidad SOBRE LA CONVOCATORIA
        │              (nunca una cadena libre; dorsal fuera de convocatoria = imposible)
        ▼
3. SEPARACIÓN EQUIPO  color de equipación → equipo, ANTES de asignar
        │              (restringe al subconjunto cerrado del equipo correcto)
        ▼
4. AGREGACIÓN POR PISTA  votación ponderada por confianza × calidad de recorte
        │                 (tamaño, nitidez, orientación). Nunca desde 1 frame.
        ▼
5. ASIGNACIÓN GLOBAL  emparejamiento con unicidad (Hungarian) sobre las pistas de
                       cada equipo. Umbral → o dorsal, o ABSTENCIÓN.
```

### Contrato de tipos (borrador)

```ts
// una lectura por frame: distribución sobre la convocatoria del equipo (cerrada)
interface JerseyReading {
  frame: number;
  trackId: string;
  team: 'local' | 'visitante' | null;   // null si el color no separa con confianza
  dist: Map<number, number>;            // dorsal → prob, SOLO dorsales de la convocatoria
  cropQuality: number;                  // 0..1 (tamaño·nitidez·orientación de espalda)
}

// resultado por PISTA tras agregación + asignación global
interface TrackIdentity {
  trackId: string;
  dorsal: number | null;                // null = anónima (resultado válido y esperado)
  team: 'local' | 'visitante' | null;
  confidence: number;                   // 0..1
  provenance: 'DERIVADA' | null;        // null cuando dorsal === null
  gate_reason: string | null;           // obligatorio si dorsal === null
  stableAnonId: string;                 // '#1', '#2', … estable aunque no haya dorsal
  framesLegible: number;                // nº de frames donde el humano/lector leería
}
```

## Umbrales — no negociables (`identidad.md`)

| Métrica | Criterio |
|---|---|
| Precisión sobre pistas asignadas | **≥ 98%** |
| Pistas con dorsal fuera de convocatoria | **= 0** |
| Dorsales en dos pistas simultáneas | **= 0** |
| Cobertura | La que permita el vídeo; se **reporta** vs el techo físico, no se fuerza |

**La precisión no se relaja para ganar cobertura. En ningún intento.** Si baja de 98%,
el sistema **abstiene más**, no acierta menos.

## Abstención (estado por defecto hoy)

Una pista sin dorsal:
- conserva su `stableAnonId` (`#1`, `#2`, …),
- `provenance: null` + `gate_reason` (p. ej. "dorsal no legible en ningún frame"),
- **nunca** recibe "el dorsal más probable" por defecto.

## Beneficio lateral: coser cambios de ID del tracker

Cuando ByteTrack parte a un jugador en varias pistas por oclusión, el dorsal las
vuelve a coser. Al implementarlo, **recalcular** distancia/sprints sobre la pista
unificada, no sobre los fragmentos (recupera recorrido perdido).

## Propagación a métricas (fail-closed, ya vigente por #24)

- Métrica sobre pista anónima **no** se renderiza bajo el nombre de un jugador: falla,
  no degrada en silencio.
- Dorsal por debajo del umbral ⇒ `confidence` reducida en todas las métricas
  derivadas, y la UI lo indica.
- La vista de sesión muestra, sin scroll, cuántas pistas quedaron anónimas y qué % del
  juego no está atribuido.

## Frontera legal (dura)

**Dorsal y color de equipación. Nunca cara.** El reconocimiento facial de menores es
dato biométrico bajo el RGPD. Esta frontera no se cruza aunque resolviera cobertura.

## Modelo de lectura (etapa 2) — decisión de licencia pendiente

El lector de dorsal por frame es lo único que falta por elegir. Del survey
(`memory/annotation-tooling-survey`):
- SOTA: jersey-number-pipeline (Koshkina/Elder, **CC BY-NC 3.0 → no comercial**),
  PARSeq (Apache-2.0) como reconocedor de dígitos.
- **Restricción clave**: el modelo solo produce una **distribución sobre la
  convocatoria**; su salida es una **sugerencia**, no la verdad. La verdad para medir
  la precisión sale de `fixtures/identidad/` (humano), nunca del propio modelo.

## Qué desbloquea la implementación

1. **G9.0** — `fixtures/identidad/` con ≥3 clips anotados a mano (herramientas y
   validador ya construidos: `tools/anotador-identidad.html` + `scripts/validate_fixtures.py`).
2. Con el ground truth: elegir el lector (etapa 2), fijar umbrales **sin mirar los
   clips de eval**, y correr `python -m vitas.identity.eval --fixtures fixtures/identidad/`
   exigiendo ≥98% precisión / 0 errores silenciosos.
3. Solo entonces se activa; hasta entonces, abstención total.

## Orden de trabajo sugerido

1. (bloqueado en usuario) anotar 3 clips → `fixtures/identidad/`.
2. Etapas 1, 3, 4 (recorte, color-equipo, agregación) son deterministas y se pueden
   construir y testear con el ground truth **sin** depender del lector.
3. Etapa 2 (lector) + etapa 5 (Hungarian) + eval de precisión al final.
4. Coser IDs del tracker y recalcular métricas sobre pistas unificadas.
