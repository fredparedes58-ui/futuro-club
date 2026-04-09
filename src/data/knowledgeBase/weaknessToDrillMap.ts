/**
 * VITAS Knowledge Base — Mapeo Debilidad → Ejercicio
 *
 * Documento estructurado que conecta cada dimensión VSI y sub-habilidad
 * con ejercicios específicos de la biblioteca de drills de VITAS.
 * Referencia: IDs de drills en src/data/drillsLibrary.ts
 */

import type { KnowledgeDocument } from "./types";

export const WEAKNESS_TO_DRILL_MAP: KnowledgeDocument[] = [
  {
    id: "map-weakness-drill",
    title: "Mapeo completo: debilidades identificadas → ejercicios recomendados",
    category: "drill",
    content: `[DRILL] Mapeo Debilidad → Ejercicio Recomendado — Guía para Plan de Desarrollo

DIMENSIÓN: VELOCIDAD (speed)
- Debilidad: "Aceleración lenta en primeros metros"
  → Ejercicio: FIS-001 (Sprints con cambio de dirección) — trabajo de explosividad en 5-10m
  → Ejercicio: FIS-004 (Velocidad de reacción) — mejorar tiempo de reacción
  → Edad: Ventana sensible 13-16 (durante/post PHV)

- Debilidad: "No puede repetir sprints"
  → Ejercicio: FIS-003 (HIIT fútbol) — intervalos de alta intensidad con balón
  → Edad: 14+ (requiere base aeróbica)

- Debilidad: "Lento en cambios de dirección"
  → Ejercicio: FIS-002 (Circuito COD) — cambios de dirección específicos
  → Ejercicio: FIS-004 (Velocidad de reacción) — componente cognitivo
  → Edad: 10-14 (ventana de coordinación/agilidad)

DIMENSIÓN: TÉCNICA (technique)
- Debilidad: "Primer toque deficiente bajo presión"
  → Ejercicio: TEC-001 (Rondo 4v2) — control bajo presión en espacio reducido
  → Ejercicio: TEC-005 (Recepción bajo presión) — control orientado con oposición
  → Coaching point: Orientar el cuerpo ANTES de recibir, superficie de control firme

- Debilidad: "No puede regatear en 1v1"
  → Ejercicio: TEC-003 (Circuito de regate 1v1) — duelo individual con variantes
  → Ejercicio: POS-WG-001 (Extremos: desborde y centro) — 1v1 en contexto de banda
  → Coaching point: Cambio de ritmo > cambio de dirección, atacar el pie adelantado del defensor

- Debilidad: "Pase impreciso"
  → Ejercicio: TEC-002 (Circuito de pases) — precisión con interior, exterior, empeine
  → Ejercicio: TAC-004 (Posesión 5v5+2) — pase bajo presión con comodines
  → Coaching point: Superficie de contacto, peso del pase, orientación del cuerpo al pasar

- Debilidad: "Pierna no hábil muy limitada"
  → Ejercicio: TEC-004 (Juego de pared) — obligar uso de pierna no hábil
  → Progresión: Todas las sesiones técnicas con restricción de pierna hábil (50% del tiempo)

DIMENSIÓN: VISIÓN (vision)
- Debilidad: "No escanea antes de recibir"
  → Ejercicio: TAC-001 (Posicionamiento táctico) — ejercicios con check-shoulder obligatorio
  → Ejercicio: TEC-001 (Rondo 4v2) — en rondo DEBE mirar antes de recibir
  → Coaching point: "Cabeza arriba ANTES del balón, no después"

- Debilidad: "Solo juega hacia adelante / hacia atrás (no varía)"
  → Ejercicio: TAC-004 (Posesión 5v5+2) — circulación con cambio de orientación obligatorio
  → Ejercicio: TAC-006 (Salida de balón desde atrás) — distribución a los 4 cuadrantes
  → Coaching point: Buscar siempre 3 opciones antes de decidir

- Debilidad: "No ve pases entre líneas"
  → Ejercicio: TAC-003 (Juego entre líneas) — mediocampistas reciben entre defensas/medios
  → Ejercicio: TEC-004 (Juego de pared) — combinaciones en corto con pase al tercer hombre
  → Coaching point: El pase entre líneas requiere timing + precisión + visión periférica

- Debilidad: "Mala lectura del juego / posicionamiento"
  → Ejercicio: TAC-001 (Posicionamiento táctico) — ejercicios de comprensión espacial
  → Ejercicio: TAC-002 (Pressing coordinado) — entender cuándo y dónde presionar
  → Video analysis: Revisar posicionamiento en video con el jugador

DIMENSIÓN: RESISTENCIA (stamina)
- Debilidad: "Se cansa rápido / baja intensidad en 2do tiempo"
  → Ejercicio: FIS-003 (HIIT fútbol) — intervalos con balón
  → Ejercicio: FIS-005 (Fuerza preventiva) — base muscular para sostener esfuerzo
  → Nota: En jugadores pre-PHV, la resistencia mejora naturalmente con juegos y partidos reducidos

- Debilidad: "No presiona en fase defensiva"
  → Ejercicio: TAC-002 (Pressing coordinado) — pressing como hábito colectivo
  → Ejercicio: PRE-001 (Gegenpressing) — presión inmediata tras pérdida
  → Coaching point: El pressing es actitud + organización, no solo condición física

DIMENSIÓN: DISPARO (shooting)
- Debilidad: "No tiene gol / disparo sin potencia"
  → Ejercicio: DIS-001 (Definición variada) — disparo desde diferentes ángulos/distancias
  → Ejercicio: DIS-002 (Disparo de primera) — remate a primer toque
  → Coaching point: Colocación > potencia en juveniles. Técnica de golpeo (empeine limpio)

- Debilidad: "No dispara cuando tiene oportunidad"
  → Ejercicio: DIS-003 (2v1 + definición) — crear situación de gol y ejecutar
  → Ejercicio: POS-ST-001 (Delantero centro: movimiento y remate) — buscar posición de gol
  → Coaching point: "Si ves portería, dispara". Mentalidad de goleador se entrena

- Debilidad: "Solo dispara con un pie"
  → Ejercicio: DIS-001 con restricción de pierna hábil — 50% de disparos con pierna no hábil

DIMENSIÓN: DEFENSA (defending)
- Debilidad: "Mala posición defensiva / llega tarde"
  → Ejercicio: TAC-001 (Posicionamiento táctico) — ajuste defensivo según balón
  → Ejercicio: POS-CB-001 (Centrales: anticipación y salida) — lectura defensiva
  → Coaching point: "Posición entre balón y portería SIEMPRE"

- Debilidad: "Pierde duelos 1v1 defensivos"
  → Ejercicio: TEC-003 (1v1) — desde perspectiva defensiva
  → Coaching point: Perfilar al rival hacia la banda, no tirarse al suelo, jockey lateral

- Debilidad: "No intercepta / no lee líneas de pase"
  → Ejercicio: TAC-002 (Pressing coordinado) — anticipar líneas de pase
  → Ejercicio: POS-CB-001 (Centrales) — interceptación anticipativa
  → Coaching point: "El mejor tackle es el que no necesitas hacer — intercepta antes"

NOTA GENERAL: El plan de desarrollo debe considerar la edad del jugador y su ventana sensible. No tiene sentido priorizar velocidad en un jugador de 11 años (ventana no abierta) ni técnica pura en uno de 17 (ventana casi cerrada). Adaptar la prioridad de ejercicios al momento de desarrollo.`,
    metadata: { tags: ["mapeo", "debilidad", "ejercicio", "plan-desarrollo", "drill", "recomendacion"] },
  },
];
