# Plan · Escudo de Estirón OBSERVADO

> **Qué es:** conectar la biomecánica que VITAS ya extrae del vídeo con el estado de
> maduración (PHV) que VITAS ya calcula, para convertir un número que nadie usa
> («asimetría 9%») en un aviso accionable que evite una lesión.
>
> **Estado:** PLAN. No implementado. Ninguna tarea de aquí se ha ejecutado.
> **Rama de trabajo prevista:** `claude/proyecto-incubadora-viabilidad-nhwwvl`
> **Fecha:** 2026-09-03

---

## 0. Resumen en una frase

> Hoy `_biomechanics-extractor.ts` mide el cuerpo y `growthSpurtShield.ts` conoce el
> estirón, **pero no se hablan** (verificado: `grep` de asimetría × PHV sale vacío).
> Este plan los conecta.

**Valor:** el mismo dato de asimetría produce tres decisiones distintas según la fase de
crecimiento. Ningún competidor puede emitir ese juicio, porque ninguno tiene las dos
señales a la vez: Catapult ve un punto (no el cuerpo); Kitman/Hylyght conocen la
maduración (pero no analizan vídeo de partido).

---

## 1. Qué existe HOY (verificado en código, no supuesto)

| Pieza | Ruta | Estado |
|---|---|---|
| Extractor biomecánico | `api/agents/_biomechanics-extractor.ts` | ✅ Funciona. Geometría pura, sin LLM. |
| → salida | `BiomechMetrics` (`:175`) | `knee.asymmetryPct`, `strideFrequencyHz`, `trunkInclinationDeg`, `sprintSpeed`, `qualityScore` |
| Escudo de Estirón | `src/lib/phv/growthSpurtShield.ts` | ✅ Funciona. Ya tiene `abstained`, `level`, `loadReductionPct`, mensajes coach/padre. |
| Offset PHV | `src/lib/phv/mirwald.ts` | ✅ Funciona. Marca `estimated` cuando falta antropometría. |
| Patrón de ajustador (×2) | `src/lib/fatigue/phvFatigueAdjuster.ts`, `src/lib/xg/phvXgAdjuster.ts` | ✅ Precedente probado a copiar. |
| Contrato de métricas | `src/lib/metrics/MetricResult.ts` | ✅ Factory `makeMetric` con 5 invariantes que lanzan. |
| Registro | `config/metrics.json` | 26 métricas declaradas. |

**Conclusión:** las dos mitades existen. Esto es una **fusión**, no un desarrollo desde cero.

---

## 2. Qué NO existe (el trabajo real)

1. Ninguna conexión entre biomecánica y PHV.
2. `BiomechMetrics` devuelve **números desnudos** → viola el invariante #1 de `CLAUDE.md`.
3. No hay persistencia histórica de biomecánica por jugador → sin ella no hay curva longitudinal.
4. No hay umbrales de asimetría por banda de maduración con fuente científica verificada.
5. No hay ground truth que confirme que la asimetría medida es real y no un artefacto.

---

## 3. ⚠️ PUNTOS DÉBILES, GAPS Y RIESGOS

> Sección deliberadamente primero. Un plan que los esconde no es un plan, es un folleto.

### 🔴 R1 — El artefacto de ángulo de cámara (EL RIESGO MÁS GRAVE)

La asimetría izquierda/derecha medida desde **pose 2D monocular** está confundida por el
ángulo de visión. Si el jugador corre en diagonal respecto a la cámara, una pierna queda
sistemáticamente escorzada → **el sistema mide asimetría que no existe**.

Esto no es un detalle: es la diferencia entre una alerta útil y **decirle a una academia
que un niño sano está descompensado**. Con menores, ese error no es un bug de UI.

**Mitigación obligatoria (F3, no opcional):**
- Filtrar frames por orientación: usar solo aquellos con el jugador aproximadamente
  frontal/sagital respecto a la cámara (derivable de la anchura hombro-cadera proyectada).
- Exigir un mínimo de frames válidos tras el filtro; por debajo → **abstención**.
- Comparar el jugador **consigo mismo a lo largo del tiempo** (misma cámara, mismo ángulo
  típico) en vez de contra un umbral absoluto. El delta es mucho más robusto que el valor.
- No emitir alerta desde una sola sesión. Ver F4.

**Si R1 no se resuelve, el resto del plan no debe desplegarse a usuarios reales.**

### 🔴 R2 — No hay umbrales con fuente científica verificada

`phvFatigueAdjuster.ts` cita literatura real (Wrigley 2014, Cumming 2018, Read 2018).
**Para asimetría biomecánica por banda PHV no dispongo de cifras verificadas**, y
`.claude/rules/metricas.md` prohíbe inventar una cita de literatura.

**Consecuencia asumida:** los umbrales salen marcados literalmente como
`"pendiente de validar"` con `confidence` reducida. Funcional y honesto, **pero no
presentable como cifra validada** ante una academia, un inversor o una incubadora hasta
que alguien (a) busque las referencias reales o (b) las valide con datos propios.

### 🟠 R3 — Dependencia de MMPose/Modal sin cablear

El extractor asume keypoints ya extraídos por MMPose en Modal. Según
`docs/pendientes-metricas.md` §C5, `MODAL_TRACK_URL` / `MODAL_API_KEY` **siguen sin
configurarse**. Sin eso no hay keypoints → no hay biomecánica → el plan no arranca.

**Bloqueante de entorno, no de código.** Es acción del usuario en el panel de Vercel.

### 🟠 R4 — La pose solo es fiable de cerca

`src/lib/yolo/poseEligibility.ts` ya establece la frontera cercano/lejano. Biomecánica
desde plano general en 4K **no va a funcionar**. Exige un **protocolo de captura**
(segmentos cercanos del jugador enfocado), que es una decisión de producto, no de código.

### 🟠 R5 — Riesgo de percepción clínica / responsabilidad

Decir «reduce carga, riesgo de lesión» sobre un **menor** roza el consejo médico.

**Mitigación:** lenguaje explícitamente orientativo, nunca diagnóstico; sello visible de
«no sustituye criterio médico»; el mensaje al padre debe tranquilizar, no alarmar
(`parentMessage` ya existe con ese propósito). Revisar con los términos legales del
producto antes de exponerlo en el canal B2C.

### 🟡 R6 — `sprintSpeed` puede venir en `px/s`

`BiomechMetrics.sprintSpeed.unit` es `"m/s" | "px/s"` según haya `pixelsPerMeter`. Sin
calibración **no es una métrica física**. El ajustador **no debe usar `sprintSpeed`** para
nada mientras venga en `px/s`.

### 🟡 R7 — Sin persistencia histórica no hay producto real

El valor está en la curva, no en la foto (F4). Requiere almacenamiento por jugador y por
sesión. Trabajo de datos adicional, con implicaciones RGPD (dato de menor).

### 🟡 R8 — Muestra pequeña

`framesAnalyzed` y `qualityScore` pueden ser bajos en clips cortos. Debe existir un mínimo
por debajo del cual se abstiene, no se estima.

---

## 4. Diseño del módulo

### Ubicación
```
src/lib/biomechanics/
  phvBiomechanicsAdjuster.ts     # núcleo puro
  biomechThresholds.ts           # umbrales, TODOS con procedencia declarada
  types.ts
```

### Principio rector
El ajustador **no inventa una métrica nueva**. Cambia **la vara de medir** según la banda
de maduración — exactamente como `phvFatigueAdjuster.ts` mueve el umbral de sprint
(5,83 m/s × 0,75 en `pre_phv`).

### Interpretación (el corazón del valor)

| Banda | Asimetría elevada significa | Acción |
|---|---|---|
| `post_phv` | Patrón motor **consolidado**; descompensación real | Derivar a valoración física |
| `circa_phv` | Probablemente **transitoria** (crecimiento > adaptación neuromuscular) | **Bajar carga de impacto.** NO tocar técnica |
| `pre_phv` | No atribuible al estirón | Corregir ahora (alta plasticidad) |

### Contrato de salida
- Devuelve `MetricResult` vía `makeMetric` (nunca números desnudos).
- `provenance: "DERIVADA"` — función determinista sobre biomecánica + offset.
- `calibrated: false` mientras no haya validación → `confidence ≤ ORIENTATIVE_CONFIDENCE (0.4)`.
- **Abstención obligatoria** (`value: null` + `gate_reason`) si:
  - el offset PHV viene `estimated` (coherente con G6 e invariante #4),
  - `knee.asymmetryPct === null`,
  - `qualityScore` o frames válidos tras el filtro de ángulo por debajo del mínimo,
  - no hay sexo registrado (invariante #5).

### Lo que NO toca
- ❌ Ninguna ecuación de Mirwald, %PAH, offsets ni valores golden (invariante #4).
- ❌ Ningún valor existente de PHV o bio-banding cambia. Aditivo puro.

---

## 5. Fases

### F0 · Desbloqueo de entorno *(usuario, sin código)*
- [ ] Configurar `MODAL_TRACK_URL` + `MODAL_API_KEY` (§C5 de `pendientes-metricas.md`).
- [ ] Decidir el **protocolo de captura** (R4).
- [ ] Revisión legal del lenguaje de riesgo sobre menores (R5).

**Sin F0, F2+ no se puede probar contra datos reales.**

### F1 · Contrato — biomecánica bajo `MetricResult`
- [ ] Envolver `BiomechMetrics` en `MetricResult` (cierra la violación del invariante #1).
- [ ] Entradas en `config/metrics.json`: `biomec_asimetria_rodilla`, `biomec_frecuencia_zancada`, `biomec_inclinacion_tronco`.
- [ ] `python scripts/audit_metrics.py --baseline` → exit 0.

*Entregable: la biomecánica deja de emitir números sin procedencia.*

### F2 · El ajustador (núcleo)
- [ ] `phvBiomechanicsAdjuster.ts` — función **pura**, sin I/O, sin LLM.
- [ ] `biomechThresholds.ts` con `source: "pendiente de validar"` explícito (R2).
- [ ] Tests: las 4 rutas de abstención + las 3 bandas + límites de `confidence`.

*Entregable: dado (biomecánica, offset) → interpretación con procedencia. Testeable sin vídeo.*

### F3 · Robustez de la señal — **mitigación de R1**
- [ ] Filtro de orientación de cámara; descarte de frames escorzados.
- [ ] Mínimo de frames válidos → abstención por debajo.
- [ ] Test con keypoints sintéticos rotados: **una rotación de cámara no debe generar asimetría**.

*Entregable: la métrica deja de ser un artefacto de ángulo. **Fase no negociable.***

### F4 · Longitudinal — el producto de verdad
- [ ] Persistir biomecánica por jugador/sesión (RGPD: dato de menor, ver R7).
- [ ] Delta contra la línea base propia del jugador, no contra umbral absoluto.
- [ ] Cruce: ¿el delta coincide con su entrada en `circa_phv`?

*Entregable: «su asimetría subió del 4% al 11% desde que entró en el estirón». Aquí está el foso.*

### F5 · UI
- [ ] Extender `GrowthSpurtShieldAlert.tsx` con la sección observada.
- [ ] Reutilizar la grafía de abstención ya existente (gris, nunca verde).
- [ ] Mensajes diferenciados coach / padre (ya soportado).

### F6 · Validación *(requiere datos humanos — no se resuelve con código)*
- [ ] Clips con jugadores de asimetría conocida (referencia física o clínica).
- [ ] Umbrales dejan de ser `"pendiente de validar"` **solo aquí**.
- [ ] Hasta entonces: métrica orientativa. Se documenta en `pendientes-metricas.md`.

---

## 6. Criterios de aceptación

- [ ] `python scripts/audit_metrics.py --baseline` → **exit 0**.
- [ ] Ningún valor de PHV / bio-banding cambia (invariante #4). Golden intactos.
- [ ] Toda salida es `MetricResult`; cero números desnudos.
- [ ] Sin sexo registrado ⇒ bloquea (invariante #5).
- [ ] Offset `estimated` ⇒ abstiene, nunca estima.
- [ ] Rotar la cámara en el test sintético **no** produce asimetría (R1).
- [ ] La UI de abstención nunca se pinta en verde.
- [ ] `npm run build` y `npm test` en verde.

---

## 7. Lo que este plan NO hace

- No mejora la precisión del tracking físico (no compite con Catapult).
- No añade xG, ball data ni eventos (no compite con StatsBomb).
- No construye la capa de identidad por dorsal (sigue abstenida).
- No promete cifras validadas: entrega una **métrica orientativa y honesta** hasta F6.

---

## 8. Decisiones que dependen de ti

1. **¿Se configura Modal (F0)?** Sin ello el plan no llega a datos reales.
2. **¿Protocolo de captura cercana?** Condiciona cómo graban las academias.
3. **¿Se acepta lanzar con umbrales `"pendiente de validar"`?** Es honesto y coherente con
   el repo, pero no vendible como cifra probada.
4. **¿Canal B2C (padres) desde el inicio?** Multiplica el valor y el riesgo (R5).
5. **¿Se prioriza F4 (longitudinal)?** Es donde está el foso real, y también el mayor coste.

---

## 9. Orden recomendado

```
F0 (usuario) → F1 → F2 → F3 ──► utilizable internamente
                              └► F4 → F5 ──► producto vendible
                                          └► F6 ──► cifra validada
```

**F3 no se salta.** Es lo que separa una alerta útil de decirle a una familia que su hijo
está descompensado cuando solo estaba corriendo en diagonal.
