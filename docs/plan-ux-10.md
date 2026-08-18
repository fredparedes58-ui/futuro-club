# Plan UX → 10/10

> Auditoría (13 ago 2026): Fluidez 7 · Navegación 5 · Entendimiento 6 · Hábito 4.
> Evidencia: 79 rutas, menú "Más" con 7 grupos/13 items, Lab de 2.356 líneas,
> Sprint no persistía al jugador, TermTooltip usado en 1 solo sitio, landing con
> métricas de uso inventadas.

**Límite honesto:** el 10/10 de "hábito" no se alcanza solo con código — exige
iterar con datos de uso real (retención semanal medida). Este plan lleva todo lo
alcanzable por software a 9-10 y deja instrumentado cómo medir el resto.

---

## Ola 1 — Conexión y honestidad *(este PR)*

| # | Cambio | Eje que sube |
|---|---|---|
| 1.1 | **Sprint → perfil**: `SprintTestService` (localStorage tipado), selector de jugador, guardar test, historial y link a la ficha. La velocidad medida (DERIVADA) deja de perderse. | Conexión 🔴→🟢 |
| 1.2 | **Menú "Más" → 3 hubs** con el modelo mental del coach: *Analizar partido · Desarrollo del jugador · Gestión del club* (antes 7 grupos). | Navegación |
| 1.3 | **Glosario inline**: `TermTooltip` dentro de `VsiGauge` → el término VSI se explica al hover/focus en TODAS las vistas que usan el gauge (7). | Entendimiento |
| 1.4 | **Landing honesta**: fuera contadores inventados (12.847 jugadores…); claims verificables de producto (+365 referencia, 5 min, 0€). | Confianza |

## Ola 2 — Camino dorado *(siguiente PR)*

- **Pulse como "inbox de hoy"**: al abrir, 3 cosas máx: *"Sube el partido del sábado"* /
  *"N insights nuevos desde tu última visita"* / *"1 jugador cambió de fase PHV"*.
  Implementación: timestamp de última visita en localStorage + diff de análisis/insights.
- **Cross-links contextuales**: ficha → Lab con el jugador preseleccionado; informe →
  ficha; test de sprint → sección física de la ficha (mostrar `bestSpeed()` del
  servicio ya creado, con su badge DERIVADA).
- **CTA post-análisis**: al terminar un análisis en Lab, botón "Ver en la ficha de X"
  (hoy el resultado muere en el Lab).

## Ola 3 — Ritual semanal (hábito honesto, no dark patterns)

- **Recordatorio post-partido** (push ya existe): "¿Jugasteis ayer? Sube el vídeo →
  insights el lunes". Programable desde el perfil del equipo (día de partido).
- **Resumen semanal compartible por WhatsApp**: 1 imagen/tarjeta por jugador (VSI,
  cambio de la semana, mejor marca de sprint) — los entrenadores viven en WhatsApp;
  compartir es el loop de crecimiento orgánico.
- **Racha de sesiones del EQUIPO** (no del niño): "4 semanas seguidas con análisis" —
  refuerza el hábito del coach sin gamificar a menores (línea roja: nada de streaks
  ni presión sobre los jugadores; son niños).
- **Métrica de éxito**: % de coaches que suben ≥1 vídeo/semana (retención W4). Sin
  esto medido, "adictiva" es opinión.

## Ola 4 — Fluidez profunda

- **Partir VitasLab** (2.356 líneas) en subcomponentes por fase (upload / tracking /
  resultados) — mismo UX, mantenibilidad y TTI mejores.
- **Descarga del modelo (84 MB) con etapas narradas**: "Descargando modelo (1/3)…
  Preparando GPU (2/3)… Listo (3/3)", con tamaño y por qué. Hoy es una barra muda.
- **Precarga oportunista**: al entrar en `/lab`, empezar a bajar el modelo antes de
  que el usuario elija vídeo.
- **Auditoría de rutas muertas**: 79 rutas; identificar las <5% de tráfico y fusionar
  o retirar (menos superficie = menos confusión).

## No-objetivos (a propósito)

- Gamificación sobre menores (rachas/badges de niños): **no**. El usuario es el
  coach; el hábito se construye sobre su flujo de trabajo, no sobre los niños.
- Notificaciones de enganche vacías ("¡vuelve!"): **no**. Cada push lleva un dato
  accionable o no se envía.
- Métricas de vanidad en landing: **no** (retiradas en Ola 1).
