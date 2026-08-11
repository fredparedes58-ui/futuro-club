---
description: Contrato MetricResult y reglas de procedencia. Cargar al tocar cualquier ruta de cálculo de métricas o componente que las presente.
globs:
  - "src/lib/metrics/**"
  - "src/lib/maturation/**"
  - "src/lib/tracking/**"
  - "src/lib/vsi/**"
  - "src/components/metrics/**"
  - "vitas/**/*.py"
  - "config/metrics.json"
---

# Contrato de métricas

## El tipo

```ts
export type Provenance =
  | 'MEDIDA'        // sensor, antropometría introducida, o píxel calibrado
  | 'DERIVADA'      // función determinista sobre entradas MEDIDA
  | 'ESTIMADA_LLM'  // salida de un modelo de lenguaje o visión generativo
  | 'CONSTANTE'     // valor fijo en código; nunca presentable como resultado
  | 'MOCK';         // dato de ejemplo; exige banner visible

export interface MetricResult<T = number> {
  value: T | null;
  provenance: Provenance;
  confidence: number;        // 0..1
  units: string | null;      // 'km/h', 'm', 'px/s', 'años', null si adimensional
  calibrated: boolean;       // false ⇒ no puede ser MEDIDA
  gate_reason: string | null; // obligatorio y no vacío si value === null
  source_ref?: string;       // ruta, id de sensor, o modelo+versión si ESTIMADA_LLM
}
```

## Invariantes que deben fallar en construcción o lanzar

1. `provenance === 'MEDIDA' && calibrated === false` → **inválido**.
2. `value === null && (gate_reason === null || gate_reason === '')` → **inválido**.
3. `provenance === 'CONSTANTE' && value !== null` renderizado en UI → **inválido**.
   Una constante no es un resultado. Si el sub-score es fijo, su `value` es `null`.
4. `provenance === 'MOCK'` renderizado sin banner visible → **inválido**.
5. `confidence` fuera de `[0,1]` → **inválido**.

Estos cinco se comprueban en el constructor/factory, no solo en tests.

## Reglas de escritura

- Ninguna función de métrica devuelve `number`. Devuelve `MetricResult`.
- Ninguna función de métrica devuelve `0` para expresar ausencia. Devuelve
  `value: null` con `gate_reason`.
- Las constantes numéricas de una ruta de cálculo van a `config/` con comentario de
  procedencia. Si no hay fuente para un umbral, la fuente se escribe literalmente
  como `"pendiente de validar"` y la métrica reduce su `confidence`. **No se inventa
  una cita de literatura.**
- Un concepto se implementa una vez. Antes de añadir un cálculo, buscar si existe.

## Reglas de presentación

- Existe **un único** componente que traduce `provenance` a etiqueta y badge.
  Ningún otro componente decide cómo se rotula una métrica.
- La palabra «medido» / «medidos» no aparece como literal en ningún componente.
  La etiqueta se deriva de `provenance`.
- Etiquetas canónicas:
  | provenance | etiqueta UI |
  |---|---|
  | `MEDIDA` | Medido |
  | `DERIVADA` | Calculado |
  | `ESTIMADA_LLM` | Estimado por IA |
  | `CONSTANTE` | — (no se renderiza) |
  | `MOCK` | Datos de ejemplo |
- `value === null` renderiza el `gate_reason`. Nunca un `0`, un guion, un `--` ni un
  placeholder numérico.

## Registro

Toda métrica tiene entrada en `config/metrics.json`:

```json
{
  "id": "velocidad_max",
  "name": "Velocidad máxima",
  "concept": "fisicas.velocidad.max",
  "provenance": "DERIVADA",
  "calc_paths": ["src/lib/tracking/speed.ts"],
  "ui_paths": ["src/components/metrics/SpeedCard.tsx"],
  "allowed_literals": [0, 1, 2, 95],
  "gated": true,
  "notes": "Pico como p95 sobre ventana móvil, no último frame."
}
```

`python scripts/audit_metrics.py` valida este registro contra el código y debe
salir 0 antes de cualquier commit. Métrica sin entrada = fallo del audit.

## Prohibiciones específicas de este repo

- No derivar ningún valor de un hash del id de jugador ni de ninguna función
  determinista sobre identificadores. Eso es `MOCK` disfrazado.
- No repartir métricas de una pista anónima entre jugadores identificados.
- No mostrar totales de jugador que mezclen tramos atribuidos y no atribuidos sin
  declarar la fracción cubierta.
- No calcular un compuesto (VSI) si sus dimensiones no alcanzan el mínimo de
  procedencia real exigido.
- No mostrar cifras en euros derivadas de datos sintéticos, bajo ninguna
  circunstancia.
