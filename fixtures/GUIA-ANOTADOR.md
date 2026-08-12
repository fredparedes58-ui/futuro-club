# Guía de uso — Anotador de identidad (`tools/anotador-identidad.html`)

Herramienta para producir el **ground truth** de un clip: identidad por pista (dorsal),
y de paso duelos y VSI. El modelo ya hizo lo mecánico (detectar y agrupar en pistas);
**tú aportas la verdad que un modelo no puede dar**: qué dorsal es cada pista, y cuándo
el número es legible.

## Antes de empezar

Si te preparo el kit, ya tienes una carpeta con:

```
vitas-anotacion-<clip>/
├── frames/                  ← los fotogramas del clip (no los toques)
├── tracks.json              ← pistas pre-etiquetadas por el modelo
├── anotador-identidad.html  ← la herramienta (doble clic para abrir)
└── GUIA.md                  ← esto
```

> Ábrela en **Chrome** (doble clic en `anotador-identidad.html`). Todo corre en tu
> navegador; nada se sube a ningún sitio.

Si lo montas tú desde cero:
```bash
ffmpeg -i clip.mov -vf fps=6 frames/d_%03d.jpg
python scripts/prelabel_tracks.py frames/ tracks.json --tile 3x3
```

## Paso a paso

### 1. Cargar
- Botón **tracks.json** → elige `tracks.json`.
- Botón **carpeta frames** → elige la carpeta `frames/`.
- El campo se llena solo y aparece la lista de **pistas** a la izquierda.

### 2. Convocatoria (una vez)
Escribe los dorsales de cada equipo separados por comas (los que ves en el partido),
y el color. Sin esto no puedes asignar dorsal.
```
Local (blanco):    1, 3, 5, 6, 9, 10, 15, 19
Visitante (verde): 1, 2, 4, 7, 8, 11, 12
```

### 3. Anotar identidad — pista a pista (lo importante)
Haz clic en una pista de la izquierda. La herramienta **salta sola al frame donde
esa pista se ve más grande** (el mejor para leer el número). Entonces:

1. **Equipo**: pulsa Local o Visitante (mira el color de la camiseta).
2. **Dorsal**: aparecen los dorsales de ese equipo → pulsa el que lleva. Si **en
   ningún frame** puedes leer el número, pulsa **anónimo** (es un resultado válido,
   no lo adivines).
3. **Legibilidad** — en la **tira de abajo** están todos los fotogramas de esa pista.
   Haz **clic en los frames donde TÚ lees el número** (se ponen en verde). Atajo:
   flechas ←/→ para moverte, tecla **L** para marcar/desmarcar el frame actual.

> **¿Qué frames debo mirar?** No todos. Mira los pocos donde el jugador está **de
> espaldas o de 3/4 a la cámara** y el número se ve. La tira te muestra un recorte
> de cada frame para que lo juzgues de un vistazo. La mayoría de frames de una pista
> NO serán legibles, y eso es normal y correcto.

Estado de cada pista: **·** sin asignar · **número** = dorsal puesto · **anón** = anónima.

> Verás **muchas** pistas (el tracker también coge público, banquillo, árbitro y
> trozos sueltos). **Salta las que no sean jugadores**: no les pongas equipo y no se
> exportan. Concéntrate en las pistas largas.

### 4. Duelos (opcional, viendo el vídeo) — apartado del panel derecho
Cada disputa de balón entre dos jugadores: tiempo aprox (min:seg), dorsal A, dorsal B,
quién ganó (o neutro), tipo. **+ Añadir duelo**. Puedes ver el vídeo normal en paralelo
para juzgarlos mejor.

### 5. VSI experto (opcional)
Tu valoración 0-100 por jugador (técnica/táctica/físico/mental). Es entrada subjetiva
declarada, no un score del sistema.

### 6. Metadatos + Exportar
Rellena `clip_id`, cámara, condiciones y **tu nombre** (anotador). Pulsa
**Exportar fixture ↓**. Se descargan (Chrome pedirá permitir varias descargas → Sí):

| fichero | va a |
|---|---|
| `anotacion.csv`, `convocatoria.json`, `clip.meta.json` | `fixtures/identidad/<clip_id>/` |
| `duelos_gt.csv`, `vsi_gt.json` | `fixtures/golden/<clip_id>/` |

## Y luego

Mándame los ficheros (o la carpeta) y yo los valido con
`python scripts/validate_fixtures.py` y te devuelvo el **reporte G9.0**: cuántas pistas,
qué % de frames son legibles, y el **techo físico** de cobertura del clip. Con eso
queda desbloqueada la evaluación de identidad (G9) sobre datos reales tuyos.

## Reglas que no se rompen

- Si no lees el número, **anónimo**. Nunca "el más probable".
- El dorsal lo pones **tú**, no el modelo. La herramienta nunca sugiere un número.
- Marca legible solo lo que **de verdad** lees. Un techo de cobertura bajo pero
  honesto es el resultado correcto.
