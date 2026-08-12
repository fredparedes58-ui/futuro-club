# fixtures/ — Ground truth de evaluación

Este árbol contiene el **ground truth humano** contra el que se mide todo lo que
emite la plataforma. No es código, no es dato de ejemplo de la app, y **no se genera
con ningún modelo**.

## La regla que no se cruza

> El ground truth lo produce una **persona**, o un **sensor calibrado** (GPS/EPTS,
> puntos de campo medidos). **Nunca un modelo.**

Validar un modelo contra las etiquetas de otro modelo es circular: mide si dos
sistemas coinciden, no si aciertan. Por eso:

- **No** se generan anotaciones sintéticas.
- **No** se infieren con visión/LLM y luego se tratan como verdad.
- **No** se ajusta ningún umbral mirando estos clips. Son **evaluación, no
  entrenamiento** (ver `.claude/rules/identidad.md`).

Un modelo **sí** puede **pre-rellenar** una sugerencia que una persona **confirma o
corrige** — esa confirmación humana es lo que la vuelve válida. La sugerencia sin
confirmar no es ground truth.

## Estructura

```
fixtures/
├── README.md                 ← este fichero (reglas)
├── identidad/                ← G9.0: dorsal por pista (evaluación de identidad)
│   ├── README.md             ← protocolo + formato
│   ├── _plantilla/           ← plantillas vacías para copiar (NO son datos)
│   └── <clip_id>/            ← un directorio por clip anotado (lo crea la persona)
└── golden/                   ← G2/G3/G4: distancia, duelos, VSI (clip de referencia)
    ├── README.md             ← protocolo + formato
    ├── _plantilla/           ← plantillas vacías
    └── <clip_id>/            ← un directorio por clip de referencia anotado
```

Los directorios `_plantilla/` **nunca** cuentan como fixture real: el validador los
ignora y se niega a tratarlos como verdad.

## Validación

```bash
python scripts/validate_fixtures.py
```

- Comprueba que cada fixture real cumple el esquema (dorsales dentro de convocatoria,
  columnas correctas, anotador declarado, unidades y método presentes).
- **Rechaza** ficheros vacíos, marcados como plantilla, o con patrones que delatan
  origen sintético (p. ej. `dorsal == track_id` en todas las filas).
- Para `identidad/`, imprime el **reporte G9.0**: nº de pistas, % de frames en que un
  humano lee el dorsal, distribución por pista, y pistas ilegibles en **todos** los
  frames (el **techo físico** de cobertura del clip).
- Si solo existen plantillas, sale 0 con un banner `PENDIENTE` honesto — «no hay
  fixtures» es un estado válido, no un aprobado falso.

## Estado actual

Solo plantillas. **Ningún clip anotado todavía.** Hasta que exista al menos un
fixture humano por rama, G2-distancia, G3-duelos, G4-VSI y G9 quedan **bloqueados por
falta de ground truth**, no por falta de código. Ese es el cuello de botella real y
es trabajo humano (ver el README de cada rama para el protocolo y el tiempo estimado).
