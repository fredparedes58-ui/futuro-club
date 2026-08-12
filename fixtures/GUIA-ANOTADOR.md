# Guía de anotación — VITAS (2 herramientas)

Para producir el **ground truth** de un clip usas dos herramientas, ambas en tu kit.
El modelo hace lo mecánico; **tú aportas la verdad que un modelo no puede dar**.

| Herramienta | Produce | Desbloquea |
|---|---|---|
| `anotador-identidad.html` | identidad por pista (dorsal) + duelos + VSI | G9 (identidad), G3 (duelos), G4 (VSI) |
| `anotador-campo.html` | calibración del campo (px→metros) | **G2 (distancia/velocidad en metros)** + semilla del modelo de campo |

Ábrelas en **Chrome** (doble clic). Todo corre en tu navegador; nada se sube.

## Tu kit

```
vitas-anotacion-1249/
├── anotador-identidad.html   ← herramienta 1
├── anotador-campo.html       ← herramienta 2
├── frames/                    (120 fotogramas, 1080p)
├── tracks.json                (pistas pre-etiquetadas)
└── GUIA.md                    (esto)
```

---

# Herramienta 1 — Identidad + duelos + VSI (`anotador-identidad.html`)

### 1. Cargar
Botón **tracks.json** (el del kit) → botón **carpeta frames** (`frames/`).

### 2. Convocatoria (una vez)
Dorsales de cada equipo separados por comas + color.

### 3. Identidad — pista a pista
Clic en una pista (salen ordenadas por longitud, las de jugadores reales arriba). La
herramienta salta al frame donde se ve más grande. Entonces:
1. **Equipo** (mira el color de camiseta).
2. **Dorsal** (de la convocatoria de ese equipo). Si nunca se lee → **anónimo**.
3. En la **tira de abajo**, clic en los frames donde **tú** lees el número (verde).
   Atajo: ←/→ para moverte, **L** para marcar el frame actual.

> Verás muchas pistas (árbitro/banquillo/público/trozos). **Salta las que no sean
> jugadores** (no les pongas equipo → no se exportan). Haz las largas primero.

### 4. Duelos (opcional, viendo el vídeo) y VSI (opcional)
Paneles del lado derecho: cada disputa (tiempo, dorsal A/B, ganador, tipo) y tu
valoración 0-100 por jugador.

### 5. Metadatos + Exportar
`clip_id`, cámara, condiciones, **tu nombre**. **Exportar fixture ↓** descarga:
`anotacion.csv`, `convocatoria.json`, `clip.meta.json` (identidad) y, si los rellenaste,
`duelos_gt.csv`, `vsi_gt.json`.

---

# Herramienta 2 — Campo / calibración (`anotador-campo.html`)

**Sirve para DOS cosas con la misma marca de puntos:**
1. **Calibración px→metros** (homografía) → las distancias salen en **metros reales**
   (G2), no en píxeles.
2. **Semilla del modelo de keypoints de campo** → para que el sistema calibre solo en
   cualquier vídeo futuro.

### Uso
1. Botón **carpeta frames** (la misma `frames/`).
2. Formato **Fútbol 8** (ya viene). Pon el **largo × ancho reales** de tu campo si no
   es el estándar FFCV 60×40 (las esquinas, línea media y postes escalan exacto).
3. Tu **nombre**.
4. En cada frame, marca los puntos que veas (esquina, borde de área, penalti, línea
   media, círculo…). El **mini-campo** te dice cuál toca (naranja). Usa la **lupa**
   (aparece al pasar el ratón) para clavar el punto. **No visible ⏭** salta el que no ves.
5. Cambia de frame con **◀ frame / frame ▶**.

> ⚠️ **La cámara de este clip se mueve** (paneo/zoom). Una sola calibración no vale para
> todo el vídeo, así que marca **varios frames repartidos** — con 8-12 a lo largo del
> clip me sobra para calibrar bien y para la semilla del modelo. Marca **≥4-6 puntos por
> frame** (cuantos más y mejor repartidos, más precisa la homografía).

6. **Exportar calibración (.json)** → descarga `calibracion.json` con todos los frames
   marcados.

---

# Y luego

Mándame los ficheros (o la carpeta) y yo:
- valido la identidad y te doy el **reporte G9.0** (pistas, % legible, techo físico);
- calculo la **homografía** desde tus puntos de campo y te enseño el **error de
  reproyección** (si es bajo, las distancias en metros son de fiar);
- meto duelos/VSI en su sitio.

## Reglas que no se rompen
- Si no lees el dorsal → **anónimo**. Nunca "el más probable".
- Marca legible/duelo/punto solo lo que **de verdad** ves. Un resultado honesto y
  parcial vale; uno inventado, no.
- El dorsal y los puntos los pones **tú**. Las herramientas nunca los adivinan.
