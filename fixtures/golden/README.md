# fixtures/golden/ — Clip de referencia (G2 distancia · G3 duelos · G4 VSI)

Objetivo: un **clip de referencia con verdad medida** contra el que se validan las
métricas físicas y compuestas. Sin esto, distancia/velocidad, duelos y VSI **no se
pueden validar** — quedan bloqueados con `gate_reason`, nunca con un número dudoso.

Un directorio `fixtures/golden/<clip_id>/` con hasta **4 ficheros** (cada métrica es
independiente: puedes anotar solo duelos, o solo distancia, y validar esa rama).

---

## 1. `calibracion.json` — de píxeles a metros (habilita G2)

La distancia y la velocidad en **metros** **exigen** calibración campo→mundo. Sin
ella, la métrica sale con `provenance: DERIVADA`, `units: px/s` y `gate_reason`, y
**jamás** en km/h. Dos métodos válidos:

```json
{
  "metodo": "puntos_campo_medidos",
  "puntos": [
    { "nombre": "esquina_area_izq", "px": [734, 412], "mundo_m": [16.5, 0.0] },
    { "nombre": "punto_penalti",    "px": [980, 505], "mundo_m": [11.0, 34.0] }
  ],
  "dimensiones_campo_m": { "largo": 100.0, "ancho": 64.0 },
  "anotador": "Nombre real"
}
```

- `puntos_campo_medidos`: ≥4 puntos con píxel **y** coordenada real conocida (marcas
  del campo, dimensiones reales del recinto). De ahí sale la homografía / m-por-px.
- `gps`: si la verdad de distancia viene de un chaleco GPS/EPTS, la calibración de
  vídeo no hace falta para validar distancia — declara `"metodo": "gps"` aquí y
  rellena `distancia_gt.json` con la fuente GPS.

> Un modelo de keypoints de campo puede **sugerir** los puntos; una persona los
> **confirma**. La homografía auto no confirmada no es calibración de referencia.

---

## 2. `distancia_gt.json` — distancia real recorrida (valida G2-distancia)

```json
{
  "metodo": "gps",                        // "gps" | "manual_calibrado"
  "fuente": "STATSports Apex / Catapult / medicion manual sobre campo calibrado",
  "jugadores": {
    "3":  { "distancia_m": 812.0, "sprints": 4, "vel_max_ms": 6.9 },
    "19": { "distancia_m": 640.5, "sprints": 2, "vel_max_ms": 6.1 }
  },
  "anotador": "Nombre real"
}
```

La clave de cada jugador es su **dorsal** (enlaza con `identidad/` si el clip es
compartido). `metodo` y `fuente` son obligatorios: sin decir de dónde sale el metro,
no es ground truth.

---

## 3. `duelos_gt.csv` — ganadores de duelo anotados a mano (valida G3)

```csv
t_inicio_s,t_fin_s,jugador_a,jugador_b,ganador,tipo,anotador
```

| columna | significado |
|---|---|
| `t_inicio_s`,`t_fin_s` | ventana temporal del duelo (segundos) |
| `jugador_a`,`jugador_b` | dorsales implicados |
| `ganador` | dorsal ganador, o `neutro` si no hay ganador claro |
| `tipo` | `aereo` \| `suelo` \| `50-50` |
| `anotador` | quién lo juzgó |

Un duelo **no** se infiere con un criterio inventado (proximidad, posesión posterior)
sin esta anotación humana contra la que validarlo. Si no hay `duelos_gt.csv`, la
tarjeta de duelos queda **bloqueada**, no se rellena con 0G/0P.

---

## 4. `vsi_gt.json` — evaluación experta (valida/ancla G4-VSI)

```json
{
  "evaluador": "Nombre del entrenador/scout",
  "fecha": "2026-08-12",
  "escala": "0-100",
  "jugadores": {
    "3": { "tecnica": 72, "tactica": 68, "fisico": 75, "mental": 70, "notas": "..." }
  }
}
```

VSI es un compuesto: sus dimensiones subjetivas (técnica/mental/táctica) solo son
válidas como **entrada de un evaluador humano declarado**, nunca como constante fija
del sistema. Este fichero es esa entrada, con nombre y fecha.

---

## Reglas comunes

- Todo fichero declara **quién** anotó/midió y **con qué método/fuente**.
- Números medidos por sensor (GPS) o por persona; **nunca** por un modelo de visión
  que luego pretendemos validar con ellos.
- Estos clips son **evaluación, no entrenamiento**: no se ajusta ningún umbral
  mirándolos.
