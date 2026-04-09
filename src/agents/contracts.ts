/**
 * VITAS Agent Contracts
 * Cada agente tiene un contrato estricto: input tipado → output tipado.
 * Claude SIEMPRE responde JSON válido según el contrato.
 */

import { z } from "zod";

// ─────────────────────────────────────────
// CONTRATO 1: PHV Calculator Agent
// Calcula maduración biológica usando fórmula Mirwald
// ─────────────────────────────────────────
export const PHVInputSchema = z.object({
  playerId: z.string(),
  chronologicalAge: z.number().min(8).max(21),
  height: z.number().min(100).max(220),       // cm
  weight: z.number().min(20).max(120),         // kg
  sittingHeight: z.number().optional(),        // cm (si disponible)
  legLength: z.number().optional(),            // cm
  gender: z.enum(["M", "F"]).default("M"),
});

export const PHVOutputSchema = z.object({
  playerId: z.string(),
  biologicalAge: z.number(),
  chronologicalAge: z.number(),
  offset: z.number(),                          // biologicalAge - chronologicalAge
  category: z.enum(["early", "ontme", "late"]),
  phvStatus: z.enum(["pre_phv", "during_phv", "post_phv"]),
  developmentWindow: z.enum(["critical", "active", "stable"]),
  adjustedVSI: z.number().min(0).max(100),     // VSI corregido por PHV
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
});

export type PHVInput = z.infer<typeof PHVInputSchema>;
export type PHVOutput = z.infer<typeof PHVOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 2: Scout Insight Agent
// Genera insights en español para ScoutFeed
// ─────────────────────────────────────────
export const ScoutInsightInputSchema = z.object({
  player: z.object({
    id: z.string(),
    name: z.string(),
    age: z.number(),
    position: z.string(),
    vsi: z.number(),
    vsiTrend: z.enum(["up", "down", "stable"]),
    phvCategory: z.enum(["early", "ontme", "late"]),
    recentMetrics: z.object({
      speed: z.number(),
      technique: z.number(),
      vision: z.number(),
      stamina: z.number(),
      shooting: z.number(),
      defending: z.number(),
    }),
    lastDrills: z.array(z.string()).optional(),
  }),
  context: z.enum(["breakout", "comparison", "phv_alert", "drill_record", "general"]),
});

export const ScoutInsightOutputSchema = z.object({
  playerId: z.string(),
  type: z.enum(["breakout", "comparison", "phv_alert", "drill_record", "general"]),
  headline: z.string().max(80),
  body: z.string().max(300),
  metric: z.string(),
  metricValue: z.string(),
  urgency: z.enum(["high", "medium", "low"]),
  tags: z.array(z.string()).max(4),
  timestamp: z.string(),
});

export type ScoutInsightInput = z.infer<typeof ScoutInsightInputSchema>;
export type ScoutInsightOutput = z.infer<typeof ScoutInsightOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 3: Role Profile Agent
// Construye perfil de rol táctico completo
// ─────────────────────────────────────────
export const RoleProfileInputSchema = z.object({
  player: z.object({
    id: z.string(),
    name: z.string(),
    age: z.number(),
    foot: z.enum(["right", "left", "both"]),
    position: z.string(),
    minutesPlayed: z.number(),
    competitiveLevel: z.string(),
    metrics: z.object({
      speed: z.number().min(0).max(100),
      technique: z.number().min(0).max(100),
      vision: z.number().min(0).max(100),
      stamina: z.number().min(0).max(100),
      shooting: z.number().min(0).max(100),
      defending: z.number().min(0).max(100),
      pressing: z.number().min(0).max(100).optional(),
      positioning: z.number().min(0).max(100).optional(),
    }),
    phvCategory: z.enum(["early", "ontme", "late"]),
    phvOffset: z.number(),
  }),
});

export const RoleProfileOutputSchema = z.object({
  playerId: z.string(),
  dominantIdentity: z.enum(["ofensivo", "defensivo", "tecnico", "fisico", "mixto"]),
  identityDistribution: z.object({
    ofensivo: z.number(),
    defensivo: z.number(),
    tecnico: z.number(),
    fisico: z.number(),
    mixto: z.number(),
  }),
  topPositions: z.array(z.object({
    code: z.string(),
    fit: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
  })).max(5),
  topArchetypes: z.array(z.object({
    code: z.string(),
    fit: z.number().min(0).max(100),
    stability: z.enum(["emergente", "en_desarrollo", "estable", "consolidado"]),
  })).max(5),
  capabilities: z.object({
    tactical: z.object({ current: z.number(), p6m: z.number(), p18m: z.number() }),
    technical: z.object({ current: z.number(), p6m: z.number(), p18m: z.number() }),
    physical: z.object({ current: z.number(), p6m: z.number(), p18m: z.number() }),
  }),
  strengths: z.array(z.string()).max(4),
  risks: z.array(z.string()).max(3),
  gaps: z.array(z.string()).max(3),
  overallConfidence: z.number().min(0).max(1),
  summary: z.string().max(400),
});

export type RoleProfileInput = z.infer<typeof RoleProfileInputSchema>;
export type RoleProfileOutput = z.infer<typeof RoleProfileOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 4: Tactical Label Agent (Fase 2 - Video)
// Recibe detección de Roboflow → asigna etiquetas PHV/táctica
// ─────────────────────────────────────────
export const TacticalLabelInputSchema = z.object({
  frameId: z.string(),
  videoId: z.string(),
  detections: z.array(z.object({
    trackId: z.number(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    zone: z.number().min(1).max(9),
    hasBall: z.boolean(),
    speedKmh: z.number(),
    jerseyNumber: z.number().optional(),
    playerData: z.object({
      age: z.number().optional(),
      height: z.number().optional(),
      weight: z.number().optional(),
      knownPosition: z.string().optional(),
    }).optional(),
  })),
  matchContext: z.object({
    minute: z.number(),
    teamPossession: z.enum(["home", "away", "disputed"]),
    fieldZone: z.enum(["defensive", "middle", "offensive"]),
  }),
});

export const TacticalLabelOutputSchema = z.object({
  frameId: z.string(),
  labels: z.array(z.object({
    trackId: z.number(),
    positionCode: z.string(),
    phvCategory: z.enum(["early", "ontme", "late", "unknown"]),
    action: z.enum(["sprint", "pass", "shot", "press", "dribble", "tackle", "off_ball_run", "static"]),
    vsiContribution: z.number().min(0).max(1),
    labelConfidence: z.number().min(0).max(1),
  })),
});

export type TacticalLabelInput = z.infer<typeof TacticalLabelInputSchema>;
export type TacticalLabelOutput = z.infer<typeof TacticalLabelOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 5: Video Intelligence Agent
// Análisis automático de video → informe completo VITAS
// ─────────────────────────────────────────
export const VideoIntelligenceInputSchema = z.object({
  playerId:       z.string(),
  videoId:        z.string(),
  playerContext:  z.object({
    name:            z.string(),
    age:             z.number().min(8).max(21),
    position:        z.string(),
    foot:            z.enum(["right", "left", "both"]),
    height:          z.number().optional(),
    weight:          z.number().optional(),
    currentVSI:      z.number().optional(),
    phvCategory:     z.enum(["early", "ontme", "late"]).optional(),
    phvOffset:       z.number().optional(),
    competitiveLevel: z.string().optional(),
  }),
  keyframes:      z.array(z.string()).max(12), // URLs de keyframes del video
  videoDuration:  z.number().optional(),       // segundos
});

export const VideoIntelligenceOutputSchema = z.object({
  playerId:       z.string(),
  videoId:        z.string(),
  generatedAt:    z.string(),

  // Sección 1: Estado Actual
  estadoActual: z.object({
    resumenEjecutivo:    z.string().max(400),
    nivelActual:         z.enum(["elite", "alto", "medio_alto", "medio", "desarrollo"]),
    fortalezasPrimarias: z.array(z.string()).max(4),
    areasDesarrollo:     z.array(z.string()).max(3),
    // 6 dimensiones observadas en video (complementan VSI, no reemplazan PHV)
    dimensiones: z.object({
      velocidadDecision:  z.object({ score: z.number().min(0).max(10), observacion: z.string() }),
      tecnicaConBalon:    z.object({ score: z.number().min(0).max(10), observacion: z.string() }),
      inteligenciaTactica: z.object({ score: z.number().min(0).max(10), observacion: z.string() }),
      capacidadFisica:    z.object({ score: z.number().min(0).max(10), observacion: z.string() }),
      liderazgoPresencia: z.object({ score: z.number().min(0).max(10), observacion: z.string() }),
      eficaciaCompetitiva: z.object({ score: z.number().min(0).max(10), observacion: z.string() }),
    }),
    ajusteVSIVideoScore: z.number().min(-15).max(15), // delta sugerido al VSI existente
  }),

  // Sección 1.5: Evaluación Psicológica (opcional — depende del video)
  evaluacionPsicologica: z.object({
    resiliencia:        z.object({ nivel: z.enum(["alto", "medio", "bajo"]), evidencia: z.string() }),
    comunicacion:       z.object({ nivel: z.enum(["alto", "medio", "bajo"]), evidencia: z.string() }),
    toleranciaRiesgo:   z.object({ nivel: z.enum(["alto", "medio", "bajo"]), evidencia: z.string() }),
    hambreCompetitiva:  z.object({ nivel: z.enum(["alto", "medio", "bajo"]), evidencia: z.string() }),
    lenguajeCorporal:   z.object({ nivel: z.enum(["alto", "medio", "bajo"]), evidencia: z.string() }),
  }).optional(),

  // Sección 2: ADN Futbolístico
  adnFutbolistico: z.object({
    estiloJuego:       z.string().max(200),
    arquetipoTactico:  z.string().max(100), // "Box-to-box", "Delantero de referencia", etc.
    patrones: z.array(z.object({
      patron:      z.string(),
      frecuencia:  z.enum(["alto", "medio", "bajo"]),
      descripcion: z.string().max(150),
    })).max(5),
    mentalidad:        z.string().max(200),
  }),

  // Sección 3: Jugador Referencia (Clon)
  jugadorReferencia: z.object({
    top5: z.array(z.object({
      proPlayerId:   z.string(),
      nombre:        z.string(),
      posicion:      z.string(),
      club:          z.string(),
      score:         z.number(),  // 0-100
      razonamiento:  z.string().max(200),
    })).max(5),
    bestMatch: z.object({
      proPlayerId:   z.string(),
      nombre:        z.string(),
      posicion:      z.string(),
      club:          z.string(),
      score:         z.number(),
      narrativa:     z.string().max(300),
    }),
  }),

  // Sección 4: Proyección de Carrera
  proyeccionCarrera: z.object({
    escenarioOptimista: z.object({
      descripcion:   z.string().max(300),
      nivelProyecto: z.string(),   // "Primera División", "Segunda División", etc.
      clubTipo:      z.string(),
      edadPeak:      z.number().optional(),
    }),
    escenarioRealista: z.object({
      descripcion:   z.string().max(300),
      nivelProyecto: z.string(),
      clubTipo:      z.string(),
    }),
    factoresClave:    z.array(z.string()).max(4),
    riesgos:          z.array(z.string()).max(3),
  }),

  // Sección 5: Plan de Desarrollo
  planDesarrollo: z.object({
    objetivo6meses:   z.string().max(200),
    objetivo18meses:  z.string().max(200),
    pilaresTrabajo: z.array(z.object({
      pilar:          z.string(),
      acciones:       z.array(z.string()).max(3),
      prioridad:      z.enum(["crítica", "alta", "media"]),
    })).max(4),
    recomendacionEntrenador: z.string().max(300),
  }),

  // Sección 6: Métricas Cuantitativas (opcionales — dependen de fuente de datos)
  metricasCuantitativas: z.object({
    fisicas: z.object({
      velocidadMaxKmh:   z.number(),
      velocidadPromKmh:  z.number(),
      distanciaM:        z.number(),
      sprints:           z.number(),
      zonasIntensidad:   z.object({
        caminar: z.number(),
        trotar:  z.number(),
        correr:  z.number(),
        sprint:  z.number(),
      }),
    }).optional(),
    eventos: z.object({
      pasesCompletados: z.number(),
      pasesFallados:    z.number(),
      precisionPases:   z.number(),
      recuperaciones:   z.number(),
      duelosGanados:    z.number(),
      duelosPerdidos:   z.number(),
      disparosAlArco:   z.number(),
      disparosFuera:    z.number(),
    }).optional(),
    fuente:    z.enum(["yolo+gemini", "gemini_only", "yolo_only"]),
    confianza: z.number().min(0).max(1),
    heatmapPositions: z.array(z.object({
      fx: z.number(),
      fy: z.number(),
    })).optional(),
  }).optional(),

  // Meta
  confianza:          z.number().min(0).max(1),
  tokensUsados:       z.number().optional(),
  modeloUsado:        z.string().optional(),
});

export type VideoIntelligenceInput  = z.infer<typeof VideoIntelligenceInputSchema>;
export type VideoIntelligenceOutput = z.infer<typeof VideoIntelligenceOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 6: Team Observation Agent (Gemini)
// Observación táctica del equipo completo
// ─────────────────────────────────────────

export const TeamObservationOutputSchema = z.object({
  formacionDetectada: z.string(),
  posesionEstimada:   z.object({
    equipo: z.number(),
    rival:  z.number(),
  }),
  jugadoresObservados: z.array(z.object({
    dorsalEstimado:  z.string().nullable(),
    posicionEstimada: z.string(),
    acciones: z.array(z.object({
      timestamp:   z.string(),
      tipo:        z.string(),
      descripcion: z.string(),
    })).max(8),
    eventosContados: z.object({
      pasesCompletados: z.number(),
      pasesFallados:    z.number(),
      recuperaciones:   z.number(),
      duelosGanados:    z.number(),
      duelosPerdidos:   z.number(),
      disparosAlArco:   z.number(),
      centros:          z.number(),
    }),
  })),
  fasesJuego: z.object({
    pressing: z.object({
      tipo:           z.string(),
      alturaLinea:    z.string(),
      intensidad:     z.number().min(1).max(10),
      observaciones:  z.array(z.string()).max(3),
    }),
    transicionOfensiva: z.object({
      velocidad: z.string(),
      patrones:  z.array(z.string()).max(3),
    }),
    transicionDefensiva: z.object({
      velocidad: z.string(),
      patrones:  z.array(z.string()).max(3),
    }),
    posesion: z.object({
      estilo:   z.string(),
      patrones: z.array(z.string()).max(3),
    }),
  }),
  momentosColectivos: z.array(z.object({
    timestamp:   z.string(),
    tipo:        z.enum(["positivo", "negativo"]),
    descripcion: z.string(),
  })).max(6),
  resumenGeneral: z.string(),
});

export type TeamObservationOutput = z.infer<typeof TeamObservationOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 7: Team Intelligence Agent (Claude)
// Informe táctico completo del equipo
// ─────────────────────────────────────────

export const TeamIntelligenceOutputSchema = z.object({
  videoId:      z.string(),
  generatedAt:  z.string(),

  equipoAnalizado: z.object({
    colorUniforme:       z.string(),
    jugadoresDetectados: z.number(),
  }),

  resumenEjecutivo: z.string().max(500),

  formacion: z.object({
    sistema:   z.string(),
    variantes: z.array(z.string()).max(3),
    rigidez:   z.number().min(1).max(10),
  }),

  posesion: z.object({
    porcentaje:         z.number(),
    estiloCirculacion:  z.string().max(200),
    zonasDominadas:     z.array(z.string()).max(4),
  }),

  fasesJuego: z.object({
    pressing: z.object({
      tipo:        z.string(),
      alturaLinea: z.enum(["alta", "media", "baja"]),
      intensidad:  z.number().min(1).max(10),
      descripcion: z.string().max(200),
    }),
    transiciones: z.object({
      ofensiva: z.object({
        velocidad:   z.string(),
        patron:      z.string(),
        descripcion: z.string().max(200),
      }),
      defensiva: z.object({
        velocidad:   z.string(),
        patron:      z.string(),
        descripcion: z.string().max(200),
      }),
    }),
  }),

  metricasColectivas: z.object({
    compacidad:            z.number().min(1).max(10),
    alturaLineaDefensiva:  z.enum(["alta", "media", "baja"]),
    amplitud:              z.number().min(1).max(10),
    sincronizacion:        z.number().min(1).max(10),
    descripcion:           z.string().max(300),
  }),

  jugadores: z.array(z.object({
    dorsalEstimado:  z.string().nullable(),
    posicion:        z.string(),
    rol:             z.string().max(100),
    rendimiento:     z.enum(["destacado", "bueno", "regular", "bajo"]),
    velocidadMaxKmh: z.number().nullable(),
    distanciaM:      z.number().nullable(),
    pases:           z.object({ completados: z.number(), fallados: z.number() }),
    duelos:          z.object({ ganados: z.number(), perdidos: z.number() }),
    recuperaciones:  z.number(),
    heatmapPositions: z.array(z.object({ fx: z.number(), fy: z.number() })).optional(),
    resumen:         z.string().max(150),
  })),

  evaluacionGeneral: z.object({
    fortalezasEquipo:  z.array(z.string()).max(4),
    areasTrabajar:     z.array(z.string()).max(3),
    recomendaciones:   z.array(z.string()).max(3),
  }),

  confianza: z.number().min(0).max(1),
});

export type TeamIntelligenceOutput = z.infer<typeof TeamIntelligenceOutputSchema>;

// ─────────────────────────────────────────
// TIPO GENÉRICO DE RESPUESTA DE AGENTE
// ─────────────────────────────────────────
export interface AgentResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed?: number;
  agentName: string;
}
