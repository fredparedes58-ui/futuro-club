---
description: Reglas de la capa de identidad por dorsal sobre tracking. Cargar al tocar detección, OCR de dorsal, asignación de identidad o propagación de identidad a métricas.
globs:
  - "vitas/identity/**"
  - "vitas/tracking/**"
  - "src/lib/tracking/**"
  - "fixtures/identidad/**"
---

# Capa de identidad por dorsal

## Qué problema es realmente

No es OCR abierto. Es **clasificación sobre conjunto cerrado**: la convocatoria del
partido (~18 dorsales por equipo, conocidos de antemano). Y tiene **restricción de
unicidad**: un dorsal no puede estar en dos pistas simultáneas, así que la
asignación es un emparejamiento global, no una decisión independiente por pista.

Tratarlo como OCR libre por frame es el error que hunde la precisión.

## Arquitectura obligatoria

1. **Recorte de torso** derivado de la caja del tracking. Nunca el frame completo.
2. **Lectura por frame** que produce una **distribución de probabilidad sobre la
   convocatoria**. Nunca una cadena de texto libre. Un dorsal fuera de convocatoria
   es imposible por construcción, no algo que se filtra después.
3. **Agregación por PISTA** mediante votación ponderada por confianza y por calidad
   del recorte (tamaño, nitidez, orientación). Nunca decisión desde un solo frame.
4. **Separación de equipo** por color de equipación **antes** de asignar, para
   restringir al conjunto cerrado del equipo correcto.
5. **Asignación final** como emparejamiento global con restricción de unicidad
   (Hungarian o equivalente), no pista a pista.

## Umbrales — no negociables

| Métrica | Criterio |
|---|---|
| Precisión sobre pistas asignadas | **≥ 98%** |
| Pistas asignadas a dorsal fuera de convocatoria | **= 0** |
| Dorsales asignados a dos pistas simultáneas | **= 0** |
| Cobertura | La que permita el vídeo; se **reporta**, no se fuerza |

**La precisión no se relaja para ganar cobertura. En ningún intento.**

Si la precisión cae por debajo de 98%, el sistema abstiene más, no acierta menos.

## Abstención

Una pista sin dorsal:

- conserva su identificador anónimo **estable** (`#1`, `#2`, …)
- se marca con `provenance: null` y `gate_reason`
- **nunca** recibe «el dorsal más probable» por defecto

La abstención es un resultado esperado y correcto, no un fallo del módulo.

## Ground truth

`fixtures/identidad/` es **evaluación, no entrenamiento**. Los umbrales no se
ajustan mirando esos clips. Las anotaciones son humanas; no se generan
sintéticamente ni se infieren con un modelo.

El % de frames en que un humano puede leer el dorsal define el **techo físico** de
cobertura del clip. Ninguna métrica de éxito puede superarlo, y presentar cobertura
sin referenciar ese techo es engañoso.

## Propagación a métricas

- Una métrica calculada sobre pista anónima **no puede renderizarse bajo el nombre
  de un jugador**. Debe fallar, no degradar silenciosamente.
- Dorsal asignado por debajo del umbral de confianza ⇒ `confidence` reducida en
  todas las métricas derivadas, y la UI lo indica.
- La vista de sesión muestra, sin scroll, cuántas pistas quedaron anónimas y qué
  porcentaje del juego no está atribuido. Una sesión con el 40% anónimo **no es una
  sesión con datos completos**.

## Beneficio lateral que hay que aprovechar

El dorsal repara los cambios de ID del tracker: cuando ByteTrack parte a un jugador
en varias pistas por oclusión, el dorsal las vuelve a coser. Eso recupera recorrido
perdido en distancia y sprints. Al implementar la costura, recalcular esas métricas
sobre la pista unificada, no sobre los fragmentos.

## Frontera legal

**Dorsal y color de equipación. Nunca cara.** El reconocimiento facial de menores es
dato biométrico bajo el RGPD, con base jurídica, evaluación de impacto y
consentimiento reforzado. Esta frontera no se cruza aunque resolviera un problema de
cobertura.
