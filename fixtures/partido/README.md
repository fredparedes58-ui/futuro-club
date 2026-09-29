# fixtures/partido/ — Ground truth de eventos de equipo (validación del partido completo)

Objetivo: el conjunto **anotado a mano** contra el que se mide el motor de observación
del análisis de partido completo por vídeo (Gemini por tramos). Mientras el motor no
supere esta validación, el análisis queda **apagado** en el servidor
(`MATCH_VIDEO_ENABLED` sin definir) y la UI lo muestra como «En validación».

Por qué existe: el spike del 2026-09-29 sobre un partido real (Veo follow-cam, sub-10
fútbol 8, tramo de 15 min) mostró que Gemini 2.5 Flash a 1 fps **fabrica** eventos de
equipo: 0 de 5 tiros citados existían en el segundo citado (comprobado con fotogramas),
los eventos llegaban en pasos de ~10 s, la posesión salió 50/50 a resolución LOW y citó
dorsales que no existen (un equipo sin números recibió «#11»).

Reglas (las de `fixtures/README.md`, sin excepción):

- Las anotaciones las hace una **persona** viendo el vídeo. Nunca un modelo.
- Es **evaluación, nunca entrenamiento**: ningún umbral, prompt ni parámetro se ajusta
  mirando un clip concreto. Si se cambia el motor, se vuelve a validar con **todos**.
- `_plantilla/` no es un fixture: el arnés se niega a usarla.
- El vídeo **no se versiona** (menores; peso). Solo `clip.meta.json` y `eventos.json`.

## Un directorio por clip: `fixtures/partido/<clip_id>/`

### `clip.meta.json`

```json
{
  "clip_id": "veo_sub10_2026_09_27_t1",
  "fuente": "partido-completo.mp4",
  "clip": "proxy.mp4",
  "duracion_s": 900,
  "anotador": "Nombre real",
  "fecha_anotacion": "2026-09-30",
  "locale": "es",
  "category": "youth",
  "attackingDir1h": null,
  "home": { "kit": { "shirt": { "hex": "#ffffff", "label": "blanco" } } },
  "away": { "kit": { "shirt": { "hex": "#7b1e2b", "label": "granate" } } }
}
```

- `clip` es la ruta **local** del vídeo relativa a este directorio (no se sube a git); se
  puede pasar también con `--clip`. Debe ser el **mismo proxy** que genera el worker
  (sin audio, `proxyFps` / `proxyHeight` de `config/matchVideo.json`):
  `node scripts/validate-match-observation.mjs --print-ffmpeg` muestra el comando.
- Los colores se declaran **como los declararía el entrenador**: la identidad de equipo
  es solo por equipación. Nunca cara, nunca dorsal.
- `notes` (opcional) solo alimenta el filtro de nombres; nunca se envía a Gemini.

### `eventos.json`

Array plano, al menos un evento, tiempos en **segundos del clip**:

```json
[
  { "t": 312, "team": "home", "category": "chance" },
  { "t": 344, "team": "away", "category": "pressing" }
]
```

- `team`: `home` | `away` (quien anota sabe qué equipo es).
- `category`: una de `build_up`, `pressing`, `defensive_block`, `attacking_transition`,
  `defensive_transition`, `set_piece`, `chance`, `possession_spell`, `other`
  (`EVIDENCE_CATEGORIES` del contrato).
- Anota **todo** lo que veas de las categorías que quieras medir en el tramo: la
  exhaustividad (recall) se calcula contra lo anotado.

## Ejecutar

```bash
node --env-file=.env.local scripts/validate-match-observation.mjs --fixture fixtures/partido/<clip_id>
```

La key se lee de `GEMINI_API_KEY` del entorno local y **nunca se imprime**. Imprime, por
tramo, base visual (¿consta que Gemini recibió vídeo?), posesión, dominio, evidencias,
descartes por identidad y la fracción de tiempos múltiplos de 10 s (señal de
plantilla); y por categoría, precisión y exhaustividad con tolerancia
`validationTimeToleranceSec`. Sale **1** si alguna queda por debajo de
`validationMinPrecision` / `validationMinRecall` (valores «pendiente de validar» en
`config/matchVideo.json`). `--save-response raw.json` guarda la respuesta cruda y
`--response raw.json` la re-puntúa sin coste.

Un clip aprobado **no basta** para activar: el owner decide con varios partidos.

## Estado actual

Solo plantilla. **Ningún clip anotado todavía.** La precisión del motor sigue
**BLOQUEADA por falta de ground truth** (`docs/pendientes-metricas.md`).
