# Remediación de métricas — Vitas

> Documento de referencia del proceso. Sobrevive a la pérdida de contexto entre
> sesiones. Si estás empezando una sesión: lee esto y `CLAUDE.md` antes de nada.

---

## 1. Definición de «operativo»

**«Operativo» NO significa «toda tarjeta muestra un número.»**

Duelos reales desde tracking, pases y posesión medidos, y el ROI del Radar de
Retención no son bugs: son **capacidades que no existen**. Un objetivo redactado
como «que todo funcione» produce heurísticas plausibles que rellenan el hueco. Ya
hay tres números de duelos incoherentes por exactamente ese motivo.

La definición alcanzable, y la que persigue este plan:

> **Cada número visible es real y verificado, o está etiquetado y bloqueado con su
> procedencia. Cero números sin procedencia.**

Eso se puede garantizar y se puede verificar automáticamente.

Los dos primeros goals **no arreglan ninguna métrica**: construyen el mecanismo que
hace imposible volver a mentir. Sin ellos, se arreglan siete cosas y en dos semanas
hay una octava.

---

## 2. Estado de partida (auditoría)

| Métrica | Estado | Diagnóstico |
|---|---|---|
| PHV / maduración | ✅ Sólido | Mirwald correcto, solo con datos reales, no inventa. Bio-banding %PAH real y gated. |
| VSI | 🟡 Orientativo | Ficha: sliders subjetivos del coach (~58 sin evaluar nada). Vídeo: 3/5 sub-scores son constantes fijas (técnica 65 / mental 60 / táctica 55, iguales para todos). |
| Velocidad máx/media | 🔴 Bug | Calibración nunca pasa en la UI → todo píxeles. El «máx» es el último frame, no el pico. |
| Distancia / sprints | 🟡 Orientativo | Distancia acumula bien. Sprints cuenta **frames**, no eventos: un sprint de 2 s ≈ 16 «sprints». |
| Duelos G/P | 🔴 Roto | Siempre 0G/0P en tracking. Otra ruta (Gemini) estima. Una tercera (EventDetectionEngine) con criterio distinto → 3 números incoherentes. |
| Pases / precisión / posesión | 🔴 Mal rotulado | Los estima Gemini mirando el vídeo. El panel los titula «Datos cuantitativos medidos». |
| Espacio (Voronoi) | 🔴 Siempre 0 | No cableado en resumen de sesión; solo funciona en vivo. |
| Radar de Retención (`/director`) | 🔴 Sintético | ROI en € y «jugadores en riesgo» salen de un **hash del id del jugador**, sin banner. Es la palanca de venta a clubes. |
| Bienestar del hijo (`/family/:id`) | 🔴 Mock sin banner | El padre ve datos de ejemplo como reales. La vista de equipo sí tiene banner. |
| Escudo de Estirón | 🔴 Entradas mal | Usa pierna estimada aunque el club haya medido la real. Fórmula masculina para jugadoras sin sexo. |
| Identidad de jugador | ⛔ No existe | Tracking detecta cuerpos anónimos (#1, #2…). OCR de dorsal + capa de identidad = tarea #25, diferida. |

Reales y gated hoy, no tocar: Rankings, Master, Director (métricas de negocio),
Live Hub, Fixtures, ScoutFeed, PeerBenchmark.

---

## 3. Secuencia

```
  G0 ──▶ G1 ──┬──▶ G2  físicas
              ├──▶ G3  duelos
              ├──▶ G4  VSI
              ├──▶ G5  mocks (Retención, Bienestar)
              ├──▶ G6  Estirón
              ├──▶ G7  Voronoi
              └──▶ G9  identidad ──▶ G10 ──▶ G8  cierre

  G9.0 (ground truth) ── en paralelo desde el día 1, no depende de nada
```

- **Serie:** G0 → G1. Base estructural, sin prisa.
- **Paralelo:** G2–G7 en worktrees separados. Tras G1 tocan módulos distintos
  detrás del mismo contrato.
- **Serie:** G10 → G8 al final.
- **G9.0 arranca ya.** Las anotaciones humanas son el cuello de botella y no las
  hace Claude.

## 4. Operativa por goal

```
/clear
lee docs/remediacion-metricas.md y CLAUDE.md, no hagas nada todavía
[pegar el bloque /goal ENTERO, verbatim, multilínea]
```

Reglas:

- **Una sesión = un goal.** Al cerrar: `/clear` y siguiente.
- **Pegar la condición completa**, nunca resumirla a «cumple la sección G2 del doc».
  El evaluador solo lee la transcripción, no el repo: si la condición apunta a un
  fichero, no tiene con qué verificar y aprueba a ciegas.
- G1 y G9 son grandes: plan mode (`Shift+Tab`) antes de lanzar el goal.
- `/goal` sin argumento → turnos y tokens consumidos. Si va por el turno 20 de 30 y
  las tablas no aparecen, cortar.
- `Esc` corta el bucle. `Esc Esc` o `/rewind` deshace.
- **Tope de 5 intentos por subproblema.** Está escrito dentro de cada goal, pero
  vigilarlo también desde fuera: cuando Claude empieza a probar variantes del mismo
  enfoque, la capacidad no existe y toca aceptar el bloqueo.

Paralelo:

```bash
git worktree add ../vitas-g3 -b fix/duelos
# una sesión de Claude Code por worktree
claude agents   # ver todas las sesiones desde una pantalla
```

---

## 5. Los goals

### G0 — Inventario de procedencia y arnés (no toca lógica)

> **Nota:** `scripts/audit_metrics.py` ya viene provisto en el repo. G0 debe
> producir `config/metrics.json` y ejecutarlo, no reescribir el script.

```
/goal Producir el inventario completo de procedencia de métricas de Vitas y ejecutar la auditoría, sin modificar ninguna lógica de cálculo.
Completado cuando he IMPRESO EN LA CONVERSACIÓN:
(1) La tabla de inventario, una fila por métrica que llega a la UI, con columnas: metrica, ruta_de_calculo (fichero:linea), procedencia clasificada en exactamente una de MEDIDA / DERIVADA / ESTIMADA_LLM / CONSTANTE / MOCK, etiqueta que muestra hoy la UI, y si la etiqueta coincide con la procedencia. Debe cubrir como mínimo: PHV, bio-banding, VSI ficha, VSI video y sus 5 sub-scores por separado, velocidad max, velocidad media, distancia, sprints, duelos por cada una de las tres rutas, pases, precision de pase, posesion, Voronoi, Radar de Retencion, Bienestar familiar, Escudo de Estiron.
(2) La lista de toda constante numerica literal que aparezca en una ruta de calculo de metrica, con fichero:linea y el valor.
(3) La lista de rutas donde el mismo concepto se calcula en mas de un sitio, con las rutas enfrentadas.
Y cuando exista config/metrics.json con una entrada por metrica y su procedencia declarada, siguiendo el esquema de .claude/rules/metricas.md; y la salida de `python scripts/audit_metrics.py` impresa en la conversacion, que en este goal DEBE salir con codigo 1 y listar los incumplimientos.
No modifiques ninguna funcion de calculo, ninguna etiqueta de UI ni ningun componente en este goal: es solo inventario y auditoria. No clasifiques como MEDIDA nada que no tenga trazabilidad a un sensor, una antropometria introducida o un pixel calibrado. Para a los 20 turnos.
```

**Criterio de éxito contraintuitivo:** que el audit salga **en rojo** al final de G0.
Significa que el inventario es honesto. Un audit verde aquí querría decir que se ha
autoengañado.

---

### G1 — Contrato de procedencia (arreglo estructural)

```
/goal Introducir el envoltorio tipado de metrica y hacer que la UI derive su etiqueta de la procedencia, no de texto fijo.
Completado cuando: (1) existe un tipo MetricResult con los campos value (numero o null), provenance (MEDIDA | DERIVADA | ESTIMADA_LLM | CONSTANTE | MOCK), confidence, units, calibrated (booleano) y gate_reason (texto o null); (2) toda metrica del inventario de G0 devuelve MetricResult y ninguna devuelve un numero desnudo, verificado por `grep` impreso en la conversacion; (3) existe un unico componente de presentacion que decide la etiqueta y el badge a partir de provenance, y ningun componente de UI contiene ya la palabra "medido" o "medidos" en literal, verificado por grep impreso en la conversacion; (4) cuando value es null la UI renderiza el gate_reason y no un 0, un guion ni un placeholder numerico, demostrado con un test que renderiza los tres estados; (5) `npm test` y `tsc --noEmit` salen 0.
Regla dura: un MetricResult con provenance MEDIDA y calibrated false es invalido y debe fallar en tiempo de construccion o lanzar. No cambies todavia ninguna formula ni arregles ningun bug de calculo: este goal solo mueve tipos y presentacion, los valores que salen deben ser identicos a los de antes. Si un cambio altera un valor numerico, es un error de este goal. Maximo 5 intentos por modulo; si un modulo no migra en 5, dejalo listado como pendiente y sigue con los demas. Para a los 30 turnos.
```

---

### G2 — Físicas: calibración, pico y eventos

```
/goal Arreglar los tres bugs de metricas fisicas y dejarlas verificadas contra el clip golden.
Completado cuando, sobre el clip de referencia con calibracion conocida, he IMPRESO EN LA CONVERSACION la salida de `npm test -- fisicas` con codigo 0 y estos cuatro comportamientos demostrados por test:
(1) CALIBRACION — la ruta de calibracion de la UI pasa y produce metros por pixel; si no hay calibracion, velocidad y distancia salen con provenance DERIVADA, units en px/s, y gate_reason explicando que falta calibracion. Nunca se muestra un valor en km/h sin calibracion.
(2) VELOCIDAD MAXIMA — es el pico de la serie suavizada, calculado como percentil 95 sobre ventana movil, no el ultimo frame. Test: una serie sintetica con pico en el medio y valor bajo al final devuelve el pico.
(3) SPRINTS — cuenta eventos, no frames, con umbral de entrada, umbral de salida distinto del de entrada, duracion minima y separacion minima entre eventos, todos en config con su valor y su justificacion documentada. Test: una serie con un sprint continuo de 2 segundos devuelve exactamente 1.
(4) DISTANCIA — acumula sobre la serie suavizada y su test compara contra la distancia conocida del clip golden con tolerancia declarada.
Los cuatro umbrales de sprint van en config con comentario de procedencia; si no tienes una fuente para un umbral, escribe la fuente como "pendiente de validar" y marca la metrica con confidence reducida, no lo inventes como si fuera literatura. Maximo 5 intentos por cada uno de los cuatro; si uno no cierra en 5, dejalo con value null y gate_reason en vez de con un numero dudoso, y listalo como pendiente. Para a los 30 turnos.
```

---

### G3 — Duelos: una ruta o ninguna

```
/goal Dejar exactamente una fuente de verdad para duelos, o ninguna visible.
Completado cuando he IMPRESO EN LA CONVERSACION: (1) las tres rutas actuales identificadas con fichero:linea y el criterio que usa cada una; (2) la decision tomada, que debe ser una de estas dos y ninguna intermedia: o la ruta de tracking detecta duelos de verdad y pasa un test sobre el clip golden con los duelos anotados a mano, o la tarjeta de duelos queda bloqueada con gate_reason y las tres rutas se reducen a una sola funcion que devuelve value null; (3) grep impreso demostrando que solo queda una implementacion de duelos en el codigo; (4) si sobrevive la ruta Gemini, su provenance es ESTIMADA_LLM y la UI lo dice, y no se llama duelos ganados sino estimacion de duelos.
Prohibido: mostrar 0G/0P cuando el significado real es "no se ha podido medir" — eso es la mentira concreta que este goal elimina. Prohibido dejar dos numeros de duelos accesibles desde ninguna vista. Prohibido inventar un criterio de ganador de duelo sin anotacion manual contra la que validarlo. Maximo 5 intentos de la deteccion real; al quinto, bloquea la tarjeta y sigue. Para a los 20 turnos.
```

---

### G4 — VSI: parcial y honesto o bloqueado

```
/goal Hacer que VSI no pueda presentarse como compuesto de cinco dimensiones cuando tres son constantes.
Completado cuando: (1) los cinco sub-scores devuelven MetricResult independientes y los tres que hoy son constantes fijas (tecnica, mental, tactica) tienen provenance CONSTANTE con value null y gate_reason, no 65 / 60 / 55; (2) el VSI compuesto solo se calcula si al menos 4 de 5 sub-scores tienen procedencia MEDIDA o DERIVADA, y si no, queda bloqueado indicando cuantas dimensiones faltan; (3) la ruta VSI ficha se renombra en la UI a evaluacion del entrenador con provenance declarada como entrada subjetiva, y deja de presentarse como score del sistema; (4) ningun jugador sin evaluar obtiene un 58 ni ninguna otra cifra por defecto, demostrado con un test sobre un jugador vacio; (5) `npm test` sale 0.
No rellenes las tres dimensiones con heuristicas nuevas para que el compuesto se pueda calcular: el objetivo de este goal es que el hueco sea visible, no que se tape. No cambies el peso de las dimensiones que si son reales. Para a los 20 turnos.
```

---

### G5 — Mocks visibles: Retención y Bienestar

```
/goal Eliminar todo dato sintetico que hoy se presenta como real en vistas de cliente.
Completado cuando he IMPRESO EN LA CONVERSACION: (1) grep demostrando que ninguna ruta de UI deriva un valor de un hash del id de jugador ni de ninguna otra funcion determinista sobre identificadores; (2) el Radar de Retencion de /director en uno de estos dos estados, sin terceras vias: calculado desde senales reales existentes con provenance DERIVADA y su formula documentada, o bloqueado con banner de datos de ejemplo visible sin scroll y con el ROI en euros retirado; (3) la vista /family/:id de Bienestar con el mismo banner que ya tiene la vista de equipo, verificado con un test de render; (4) un test que recorre las vistas de cliente y falla si encuentra un MetricResult con provenance MOCK renderizado sin banner.
El ROI en euros no se muestra bajo ninguna circunstancia mientras proceda de un hash: es la cifra de mayor riesgo comercial de todo el producto. Si eliges la via de senales reales y no cierra en 5 intentos, bloquea con banner y listalo como pendiente. Para a los 20 turnos.
```

> **Coste comercial, asumido a propósito:** después de G5 hay **menos** que enseñar
> en la demo. Enseñar un ROI en euros inventado a un club que luego mide la
> retención real cierra el mercado entero de una vez.

---

### G6 — Estirón: medido sobre estimado, y sexo

> **Estado (ago 2026):** Parte (2) SEXO ✅ hecha en PRs #136–138: form exige sexo
> explícito (sin default "M"), `playerService`/schemas API optional, agente PHV
> lanza `PHV_MISSING_SEX` (422) antes del if(gender), endpoint gatea, escritura
> Supabase → null, `mirwald` gender REQUERIDO, `usePHVProduct` bloquea con
> sexo desconocido, y migración 056 quita el `DEFAULT 'M'` de la BD. Golden 22/22
> intactos; tests M/F/ausente en `maturity.test.ts`. Parte (1) MEDIDO-SOBRE-ESTIMADO
> parcial: `computeMirwald` estima sitting/leg si faltan y marca `estimated` +
> baja confidence, pero falta el test explícito de los dos casos y reflejar la
> elección en `provenance`. Pendiente: la decisión de datos legacy (jugadores ya
> guardados como "M" por el default viejo).

```
/goal Corregir la seleccion de entrada y la formula por sexo en Escudo de Estiron.
Completado cuando: (1) la longitud de pierna medida por el club se usa siempre que exista y la estimada solo como fallback, con la eleccion reflejada en provenance y confidence, demostrado con un test de los dos casos; (2) a una jugadora nunca se le aplica la formula masculina: si el sexo esta registrado se usa la formula correspondiente, y si falta el resultado queda bloqueado con gate_reason pidiendo el dato, demostrado con un test de los tres casos sexo femenino, masculino y ausente; (3) `npm test` sale 0 y ninguna prediccion de Estiron se emite con datos incompletos.
No apliques una formula por defecto cuando falte el sexo, ni infieras el sexo de ningun otro campo. Este modulo alimenta decisiones sobre carga de entrenamiento en menores: ante dato ausente se bloquea, nunca se estima. Para a los 15 turnos.
```

---

### G7 — Voronoi en resumen de sesión

```
/goal Cablear el espacio Voronoi al resumen de sesion o bloquearlo explicitamente.
Completado cuando: (1) el calculo que ya funciona en vivo se reutiliza en el resumen de sesion sin duplicar la implementacion, verificado con grep de una sola definicion; (2) sobre el clip golden el resumen produce un valor de espacio distinto de 0 y coherente con el que produce la ruta en vivo sobre el mismo clip, con la diferencia entre ambos impresa en la conversacion y por debajo de la tolerancia declarada; (3) si el cableado no es posible porque el resumen no dispone de las posiciones necesarias, el valor sale null con gate_reason y NUNCA 0.
Un 0 que significa "no calculado" es el bug de este goal: eliminalo aunque el cableado no se consiga. Maximo 5 intentos. Para a los 15 turnos.
```

---

### G9.0 — Ground truth de identidad

> Arranca el día 1, en paralelo. Es el cuello de botella real: el trabajo de
> anotación es humano.

```
/goal Producir el conjunto anotado de identidad sobre el que se medira todo lo demas.
Completado cuando existe fixtures/identidad/ con: (1) al menos 3 clips de 60 segundos de partido real, cubriendo camara fija y camara movil, y al menos uno con condiciones malas (contraluz o lluvia o distancia larga); (2) para cada clip, un fichero de anotacion con una fila por (frame, track_id_de_tracking, dorsal_real, equipo, dorsal_legible_por_humano booleano); (3) la convocatoria de cada clip como lista cerrada de dorsales por equipo; (4) el reporte impreso EN LA CONVERSACION con: numero de pistas anotadas, % de frames en que un humano puede leer el dorsal, distribucion de esa legibilidad por pista, y numero de pistas donde el dorsal no es legible en NINGUN frame.
Esa ultima cifra es el techo fisico de cobertura del clip y define contra que se compara el sistema: ninguna metrica de exito puede superarlo.
No generes anotaciones sinteticas ni las infieras con un modelo: si no hay anotacion humana, este goal no esta completo. No uses estos clips para ajustar ningun umbral despues; son evaluacion, no entrenamiento. Para a los 15 turnos.
```

---

### G9 — Lectura de dorsal y asignación de identidad

```
/goal Implementar la capa de identidad por dorsal sobre el tracking existente, con precision garantizada y cobertura medida.
Completado cuando `python -m vitas.identity.eval --fixtures fixtures/identidad/` sale con codigo 0 y he IMPRESO EN LA CONVERSACION la tabla de resultados por clip con estas cuatro cifras y estos criterios:
(1) PRECISION — de las pistas a las que el sistema asigna dorsal, % con el dorsal correcto. DEBE ser mayor o igual a 98%. Si baja de 98 el goal no esta completo, aunque la cobertura sea alta.
(2) COBERTURA — % de pistas con dorsal asignado, reportado tambien como fraccion del techo fisico de G9.0.
(3) ERRORES SILENCIOSOS — numero de pistas asignadas a un dorsal que no esta en la convocatoria, y numero de dorsales asignados a dos pistas simultaneas. Ambos DEBEN ser CERO.
(4) ABSTENCION — % de pistas dejadas como anonimas, con el motivo agregado por categoria.
La arquitectura debe cumplir: recorte de torso derivado de la caja del tracking, no del frame completo; lectura por frame que produce distribucion de probabilidad sobre la convocatoria, nunca una cadena libre; agregacion por PISTA mediante votacion ponderada por confianza y por calidad del recorte, nunca decision desde un solo frame; asignacion final resuelta como emparejamiento global con restriccion de unicidad, no pista a pista; separacion de equipo por color de equipacion antes de asignar, con la convocatoria del equipo correspondiente como conjunto cerrado.
Una pista sin dorsal conserva su identificador anonimo estable y se marca con provenance null y gate_reason. NUNCA se le asigna el dorsal mas probable por defecto: la abstencion es un resultado valido y esperado.
Maximo 5 intentos de mejora del modelo o de los umbrales. Al quinto, congela lo alcanzado, deja el resto en abstencion y documenta la cobertura real. No relajes el 98% de precision para ganar cobertura en ningun intento. No ajustes umbrales mirando los clips de G9.0. Para a los 40 turnos.
```

**Por qué el 98% es alcanzable:** conjunto cerrado de ~18 dorsales + votación por
pista + emparejamiento global con unicidad. El sistema abstiene en lo dudoso y
acierta en lo que decide. Con un 90%, uno de cada diez perfiles enseñados a un club
tiene datos de otro niño, y se descubre el primer día que un padre mira el vídeo.

---

### G10 — Propagación de identidad

```
/goal Hacer que la confianza de identidad se propague a toda metrica por jugador y que nada se atribuya a un nombre sin respaldo.
Completado cuando: (1) toda metrica por jugador lleva la identidad como parte de su MetricResult, y una metrica calculada sobre una pista anonima NO puede renderizarse bajo el nombre de un jugador, demostrado con un test que lo intenta y falla; (2) las metricas de una pista con dorsal asignado por debajo del umbral de confianza salen con confidence reducida y la UI lo indica; (3) existe una vista de sesion que muestra explicitamente cuantas pistas quedaron anonimas y que porcentaje del juego no esta atribuido, visible sin scroll, porque una sesion con el 40% anonimo NO es una sesion con datos completos; (4) ninguna metrica agregada de jugador (totales de distancia, sprints, velocidad) se calcula sobre pistas parcialmente atribuidas sin declararlo, demostrado con un test; (5) `npm test`, `tsc --noEmit` y `python scripts/audit_metrics.py` salen 0.
Prohibido repartir las metricas de una pista anonima entre los jugadores identificados. Prohibido mostrar un total de jugador que mezcle tramos atribuidos y no atribuidos sin indicar la fraccion cubierta. Para a los 25 turnos.
```

---

### G8 — Cierre verificado

```
/goal Cerrar la remediacion con el audit en verde y el estado real documentado.
Completado cuando he IMPRESO EN LA CONVERSACION: (1) la salida de `python scripts/audit_metrics.py` con codigo 0; (2) la salida de `npm test` y `tsc --noEmit` con codigo 0; (3) la tabla final una fila por metrica con procedencia, estado visible o bloqueada, y test que la cubre, incluyendo la fila de identidad por dorsal con precision y cobertura; (4) docs/pendientes-metricas.md con toda metrica bloqueada, que dato o capacidad le falta, y que haria falta para desbloquearla; (5) el diff de valores antes y despues para PHV y bio-banding, que debe ser CERO — si PHV cambio en algun punto, algo de esta remediacion lo rompio y hay que revertirlo.
No marques como resuelta ninguna metrica que este bloqueada: bloqueada y resuelta son estados distintos y el documento debe distinguirlos. No cierres el goal con el audit en rojo. Para a los 15 turnos.
```

---

## 6. Los tres mecanismos que impiden la recaída

Por encima de los arreglos puntuales, esto es el valor real del plan:

1. **`MetricResult`** — un número sin procedencia no compila.
2. **`audit_metrics.py` en pre-commit** — una constante nueva en una ruta de cálculo
   no entra.
3. **`docs/pendientes-metricas.md`** — la lista de lo que falta para poder venderlo,
   en vez de que el hueco viva escondido en un `65` literal.

## 7. Presupuesto

| Bloque | Estimación |
|---|---|
| G0 + G1 | 1 día |
| G2–G7 en paralelo | 2–3 días |
| G9.0 | Depende de la anotación manual (trabajo humano) |
| G9 | El más caro con diferencia |
| G10 + G8 | 1 día |

## 8. Seguimiento

| Goal | Estado | Cerrado |
|---|---|---|
| G0 inventario | ☐ | |
| G1 contrato | ☐ | |
| G2 físicas | ☐ | |
| G3 duelos | ☐ | |
| G4 VSI | ☐ | |
| G5 mocks | ☐ | |
| G6 estirón | 🟡 parcial | sexo ✅ (#136–138, ago 2026); falta medido-sobre-estimado |
| G7 Voronoi | ☐ | |
| G9.0 ground truth | ☐ | |
| G9 identidad | ☐ | |
| G10 propagación | ☐ | |
| G8 cierre | ☐ | |
