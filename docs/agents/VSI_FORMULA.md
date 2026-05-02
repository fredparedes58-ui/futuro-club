# VITAS Score Index (VSI) · Fórmula oficial v1.0

**Documento técnico canónico.** Toda implementación del VSI debe respetar exactamente esta especificación. Cualquier divergencia es un bug.

---

## 1. Fórmula

```
VSI = 0.30·Técnica + 0.25·Físico + 0.20·Mental + 0.15·Táctica + 0.10·Proyección
```

- Cada subscore va de **0 a 100**.
- VSI resultante va de **0 a 100**, redondeado a 1 decimal.
- Pesos suman exactamente 1.00.

---

## 2. Tiers oficiales

| Tier | Rango VSI | Color | Mensaje al usuario |
|---|---|---|---|
| **Elite** | ≥85 | `#22e88c` | "Talento de élite con proyección profesional" |
| **Pro** | 70–84 | `#1A8FFF` | "Perfil profesional con margen de crecimiento" |
| **Talent** | 50–69 | `#DC8B0A` | "Talento en desarrollo con áreas claras de mejora" |
| **Develop** | <50 | `#EB1D1D` | "Foco en fundamentos y desarrollo técnico" |

---

## 3. Subscores · cómo se calculan

### 3.1 Técnica (peso 30%)

Inputs (todos en escala 0-100):
- `pose_quality_passing` — calidad postura en pase (deriva de keypoints en frames con balón)
- `pose_quality_shooting` — calidad postura en chut (íd.)
- `control_first_touch_pct` — primeros toques exitosos / total intentos
- `dribble_efficiency` — regates exitosos / total intentos

```
Técnica = 0.30·pose_quality_passing
       + 0.30·pose_quality_shooting
       + 0.20·control_first_touch_pct
       + 0.20·dribble_efficiency
```

### 3.2 Físico (peso 25%)

Inputs:
- `sprint_speed_norm` — sprint speed normalizado a edad y posición (0-100)
- `stride_frequency_norm` — frecuencia zancada normalizada (0-100)
- `asymmetry_penalty` — `100 − min(asymmetryPct × 5, 100)`
- `endurance_proxy` — sprints sostenidos en últimos 30s del clip (0-100)

```
Físico = 0.35·sprint_speed_norm
      + 0.20·stride_frequency_norm
      + 0.20·asymmetry_penalty
      + 0.25·endurance_proxy
```

### 3.3 Mental (peso 20%)

Inputs (proxies derivados del comportamiento espacio-temporal):
- `decision_latency_inverse` — `100 − tiempo_medio_a_acción_ms × 0.05`
- `pressure_resistance` — % decisiones correctas con oponente <2m
- `consistency` — desviación estándar de calidad técnica entre acciones (invertida)

```
Mental = 0.40·decision_latency_inverse
      + 0.35·pressure_resistance
      + 0.25·consistency
```

### 3.4 Táctica (peso 15%)

Inputs:
- `positioning_score` — % tiempo en zona óptima del rol (0-100)
- `off_ball_movement` — desplazamiento sin balón normalizado a posición
- `space_awareness` — capacidad de encontrar líneas (proxy de ángulos cabeza)

```
Táctica = 0.40·positioning_score
       + 0.30·off_ball_movement
       + 0.30·space_awareness
```

### 3.5 Proyección (peso 10%)

Input principal: `adjustedVSI` del módulo PHV (Mirwald) ya calculado.

```
Proyección = adjustedVSI
```

Fórmula PHV adjusted:
- `early` (offset < -1.0): VSI base × 1.12
- `ontime` (-1.0 ≤ offset ≤ 1.0): VSI base × 1.00
- `late` (offset > 1.0): VSI base × 0.92

---

## 4. Ejemplo numérico completo

Jugador sub-13 mediocentro:

| Subscore | Inputs | Cálculo | Valor |
|---|---|---|---|
| Técnica | passing=72, shooting=65, touch=70, dribble=68 | 0.30·72 + 0.30·65 + 0.20·70 + 0.20·68 | **68.7** |
| Físico | sprint=80, stride=75, asym=70 (asym=6%), endur=72 | 0.35·80 + 0.20·75 + 0.20·70 + 0.25·72 | **75.0** |
| Mental | latency=68, pressure=60, consistency=72 | 0.40·68 + 0.35·60 + 0.25·72 | **66.2** |
| Táctica | position=58, offball=65, awareness=62 | 0.40·58 + 0.30·65 + 0.30·62 | **61.3** |
| Proyección | PHV early, base 70 | 70 × 1.12 | **78.4** |

```
VSI = 0.30·68.7 + 0.25·75.0 + 0.20·66.2 + 0.15·61.3 + 0.10·78.4
    = 20.61 + 18.75 + 13.24 + 9.20 + 7.84
    = 69.6
```

→ Tier: **Talent** (50-69, con margen para "Pro")

---

## 5. Tests obligatorios

Todo cambio en la fórmula o en los pesos requiere actualizar:

1. `api/agents/_vsi-calculator.ts` (constantes `VSI_WEIGHTS`)
2. `api/agents/__tests__/_vsi-calculator.test.ts` (10+ casos)
3. Esta documentación
4. Marketing copy en frontend

**No se permite tunear pesos sin un experimento controlado** (mínimo 50 jugadores con VSI medido por coach humano como ground truth, comparar correlación).

---

## 6. Versionado

| Versión | Fecha | Cambios |
|---|---|---|
| **v1.0** | 2026-05 | Fórmula inicial. Pesos: 30/25/20/15/10. |

Cuando se actualice la fórmula, se incrementa la versión semver y se mantienen los VSI antiguos en BBDD con su versión asociada para evitar comparaciones inválidas.
