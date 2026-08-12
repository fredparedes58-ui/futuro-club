# fixtures/identidad/ — Ground truth de identidad (G9.0)

Objetivo: el conjunto anotado sobre el que se mide la **capa de identidad por
dorsal**. Define el **techo físico** de cobertura de cada clip: ninguna métrica de
éxito del sistema puede superar el % de frames en que un humano lee el dorsal.

## Qué hay que producir (criterio de G9.0)

Al menos **3 clips de ~60 s de partido real**, cubriendo:

- cámara **fija** (trípode) y cámara **móvil** (seguimiento manual),
- al menos **uno en malas condiciones**: contraluz, lluvia o distancia larga.

Para cada clip, un directorio `fixtures/identidad/<clip_id>/` con **3 ficheros**:

### 1. `clip.meta.json` — metadatos del clip

```json
{
  "clip_id": "cf_liga_2029_sub14_p1",
  "fuente": "IMG_XXXX.MOV",
  "fps": 30,
  "duracion_s": 60,
  "resolucion": "1920x1080",
  "camara": "fija",              // "fija" | "movil"
  "condiciones": "buena",        // "buena" | "contraluz" | "lluvia" | "distancia_larga"
  "anotador": "Nombre real",     // quién anotó (obligatorio, no vacío, no "PLANTILLA")
  "fecha_anotacion": "2026-08-12"
}
```

### 2. `convocatoria.json` — conjunto cerrado de dorsales por equipo

La identidad **no es OCR libre**: es clasificación sobre un conjunto cerrado. Un
dorsal fuera de convocatoria es **imposible por construcción**, no algo que se filtra
después.

```json
{
  "equipo_local":     { "nombre": "CF Local",   "color": "blanco", "dorsales": [1,3,5,6,7,9,10,11,15,19] },
  "equipo_visitante": { "nombre": "CD Visita",   "color": "verde",  "dorsales": [1,2,4,8,12,14,16,17,20,21] }
}
```

### 3. `anotacion.csv` — una fila por (frame, pista)

```csv
frame,track_id,dorsal_real,equipo,dorsal_legible
```

| columna | significado |
|---|---|
| `frame` | índice de frame (entero, 0-based, consistente con el tracking) |
| `track_id` | id de pista del tracker (el que produce el pipeline) |
| `dorsal_real` | el dorsal **verdadero** del jugador de esa pista (lo determina la persona, puede deducirlo de otros frames aunque en ESTE no se lea). Debe estar en la convocatoria del `equipo`. |
| `equipo` | `local` o `visitante` |
| `dorsal_legible` | `1` si un humano puede leer el dorsal **en este frame**, `0` si no |

`dorsal_real` es la verdad estable de la pista. `dorsal_legible` es por-frame: mide
cuántas veces el número es físicamente legible. La diferencia entre ambos es
exactamente lo que define el techo de cobertura.

## Flujo asistido (modelo pre-etiqueta, humano confirma)

Anotar a mano desde cero es el cuello de botella. El acelerador reparte el trabajo de
forma honesta: **el modelo pre-etiqueta la geometría, la persona aporta la identidad.**

```bash
# 1. Extrae frames del clip a una carpeta (fps conocido)
ffmpeg -i clip.mov -vf fps=10 frames/d_%03d.jpg

# 2. El modelo pre-etiqueta cajas + agrupa en pistas (NO asigna dorsal)
python scripts/prelabel_tracks.py frames/ tracks.json

# 3. La persona confirma en el navegador → exporta el fixture
#    Abre tools/anotador-identidad.html, carga tracks.json + la carpeta frames/,
#    y por PISTA asigna equipo, dorsal (de la convocatoria) y marca los frames legibles.
#    Descarga anotacion.csv + convocatoria.json + clip.meta.json aquí.

# 4. Valida (imprime el reporte G9.0)
python scripts/validate_fixtures.py
```

El modelo **nunca** propone un dorsal: eso sería circular. Solo dibuja cajas y las
cose en pistas, convirtiendo "dibujar miles de cajas" en "confirmar decenas de
pistas". La decisión de identidad —y de legibilidad— es siempre humana.

## Reglas de anotación (no negociables)

- **Humano.** Un modelo puede pre-dibujar las cajas del tracker; la persona solo
  asigna `dorsal_real` y marca `dorsal_legible`. La sugerencia de un modelo sobre
  QUÉ número es **no** vale como ground truth.
- Una pista cuyo dorsal **no se lee en ningún frame** se anota igualmente con su
  `dorsal_real` si la persona lo deduce (contexto, alineación); si es **imposible**
  de determinar, se deja `dorsal_real` vacío y todas sus filas con `dorsal_legible=0`.
  Esa pista cuenta como **anónima** — es un resultado válido, no un fallo.
- No se anota mirando la salida del sistema de identidad que vamos a evaluar.

## Reporte que produce el validador

`python scripts/validate_fixtures.py` imprime, por clip:

1. nº de pistas anotadas,
2. % de frames en que el dorsal es legible (global),
3. distribución de esa legibilidad **por pista**,
4. nº de pistas **ilegibles en todos los frames** → **techo físico de cobertura**.

Contra ese techo se compara luego G9. Ninguna cobertura del sistema puede superarlo,
y presentar cobertura sin referenciarlo es engañoso.

## Tiempo estimado

~30-60 min de anotación humana por clip de 60 s (según densidad de pistas y
legibilidad). Es el cuello de botella real del roadmap de fiabilidad.
