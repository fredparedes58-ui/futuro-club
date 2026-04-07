/**
 * VITAS · Error Diagnostic Service
 *
 * Servicio determinista que analiza errores en runtime y retorna
 * diagnósticos claros con causa raíz y acción sugerida.
 * No usa IA — es 100% basado en reglas.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ErrorDiagnosis {
  /** Código único del error para tracking */
  code: string;
  /** Categoría del error */
  category: "upload" | "video" | "api" | "auth" | "supabase" | "tracking" | "billing" | "unknown";
  /** Título corto para mostrar al usuario */
  title: string;
  /** Explicación clara de qué pasó */
  cause: string;
  /** Acción concreta que el usuario puede tomar */
  action: string;
  /** Severidad: error (bloquea), warning (degradado), info (informativo) */
  severity: "error" | "warning" | "info";
  /** Si el error es recuperable con retry */
  retryable: boolean;
}

// ── Reglas de diagnóstico ────────────────────────────────────────────────────

interface DiagnosticRule {
  /** Patrón para matchear el mensaje de error */
  pattern: RegExp;
  /** Contexto opcional (dónde ocurrió el error) */
  context?: string;
  /** Diagnóstico a retornar */
  diagnosis: ErrorDiagnosis;
}

const RULES: DiagnosticRule[] = [
  // ── Upload / Bunny ──────────────────────────────────────────────────────
  {
    pattern: /Upload failed.*40[13]/i,
    diagnosis: {
      code: "BUNNY_AUTH_FAILED",
      category: "upload",
      title: "Error de autenticación con el servidor de video",
      cause: "La firma de autenticación para subir el video es inválida o expiró.",
      action: "Intenta subir de nuevo. Si persiste, verifica que BUNNY_STREAM_API_KEY está configurada correctamente en Vercel.",
      severity: "error",
      retryable: true,
    },
  },
  {
    pattern: /Upload failed.*429/i,
    diagnosis: {
      code: "BUNNY_RATE_LIMIT",
      category: "upload",
      title: "Demasiados uploads simultáneos",
      cause: "Se alcanzó el límite de requests de Bunny Stream.",
      action: "Espera unos segundos y vuelve a intentar.",
      severity: "warning",
      retryable: true,
    },
  },
  {
    pattern: /Upload failed.*5\d{2}/i,
    diagnosis: {
      code: "BUNNY_SERVER_ERROR",
      category: "upload",
      title: "Error del servidor de video",
      cause: "Bunny Stream está experimentando problemas temporales.",
      action: "Espera un momento y reintenta. Si persiste, revisa status.bunny.net.",
      severity: "error",
      retryable: true,
    },
  },
  {
    pattern: /XHR network error|tus.*network|fetch.*failed/i,
    diagnosis: {
      code: "NETWORK_ERROR",
      category: "upload",
      title: "Error de conexión",
      cause: "Se perdió la conexión a internet durante el upload.",
      action: "Verifica tu conexión y reintenta. El upload es resumable — continuará donde se quedó.",
      severity: "error",
      retryable: true,
    },
  },
  {
    pattern: /Upload cancelled|abort/i,
    diagnosis: {
      code: "UPLOAD_CANCELLED",
      category: "upload",
      title: "Upload cancelado",
      cause: "El upload fue cancelado manualmente.",
      action: "Puedes subir el video de nuevo cuando quieras.",
      severity: "info",
      retryable: true,
    },
  },
  {
    pattern: /Timeout.*encoding/i,
    diagnosis: {
      code: "BUNNY_ENCODE_TIMEOUT",
      category: "upload",
      title: "El video tardó demasiado en procesarse",
      cause: "Bunny Stream no terminó de encodificar el video en el tiempo límite (4 min).",
      action: "Intenta con un video más corto o en menor resolución. MP4 H.264 es el formato más rápido.",
      severity: "warning",
      retryable: true,
    },
  },
  {
    pattern: /BUNNY_STREAM.*no configurad|phase2Pending/i,
    diagnosis: {
      code: "BUNNY_NOT_CONFIGURED",
      category: "upload",
      title: "Servidor de video no configurado",
      cause: "Faltan las variables BUNNY_STREAM_LIBRARY_ID o BUNNY_STREAM_API_KEY.",
      action: "El video se procesará localmente. Para uploads permanentes, configura Bunny Stream en Vercel.",
      severity: "info",
      retryable: false,
    },
  },
  {
    pattern: /Init failed/i,
    diagnosis: {
      code: "UPLOAD_INIT_FAILED",
      category: "upload",
      title: "No se pudo iniciar el upload",
      cause: "El servidor no pudo crear la entrada de video en Bunny.",
      action: "Verifica tu conexión e intenta de nuevo.",
      severity: "error",
      retryable: true,
    },
  },

  // ── Video / Reproducción ────────────────────────────────────────────────
  {
    pattern: /MEDIA_ELEMENT_ERROR|Format error|code.*4.*error/i,
    diagnosis: {
      code: "VIDEO_SOURCE_EXPIRED",
      category: "video",
      title: "Video no disponible",
      cause: "El enlace al video expiró (los videos locales se pierden al refrescar la página).",
      action: "Vuelve a subir el archivo de video para analizarlo.",
      severity: "warning",
      retryable: false,
    },
  },
  {
    pattern: /Error cargando video.*code.*[123]/i,
    diagnosis: {
      code: "VIDEO_LOAD_ERROR",
      category: "video",
      title: "Error al cargar video",
      cause: "El navegador no pudo cargar el video. Puede ser un problema de red o formato incompatible.",
      action: "Intenta con un video MP4 (H.264). Si el error persiste, sube el video de nuevo.",
      severity: "error",
      retryable: true,
    },
  },
  {
    pattern: /Video demasiado grande|too large/i,
    diagnosis: {
      code: "VIDEO_TOO_LARGE",
      category: "video",
      title: "Video demasiado grande",
      cause: "El archivo excede el tamaño máximo permitido.",
      action: "Usa un video de menor duración o resolución. Máximo recomendado: 500MB.",
      severity: "error",
      retryable: false,
    },
  },
  {
    pattern: /No se pudieron extraer frames/i,
    diagnosis: {
      code: "FRAME_EXTRACTION_FAILED",
      category: "video",
      title: "No se pudieron extraer fotogramas",
      cause: "El navegador no pudo decodificar el video para extraer imágenes.",
      action: "Verifica que el video es un MP4 válido. Si usas MOV de iPhone, conviértelo a MP4 primero.",
      severity: "error",
      retryable: false,
    },
  },

  // ── APIs / Gemini / Claude ──────────────────────────────────────────────
  {
    pattern: /GEMINI_API_KEY no configurad/i,
    diagnosis: {
      code: "GEMINI_NOT_CONFIGURED",
      category: "api",
      title: "Análisis de video no disponible",
      cause: "La clave de API de Gemini no está configurada en el servidor.",
      action: "Configura GEMINI_API_KEY en las variables de entorno de Vercel.",
      severity: "error",
      retryable: false,
    },
  },
  {
    pattern: /ANTHROPIC_API_KEY|Claude.*no configurad/i,
    diagnosis: {
      code: "CLAUDE_NOT_CONFIGURED",
      category: "api",
      title: "Generación de informes no disponible",
      cause: "La clave de API de Claude no está configurada en el servidor.",
      action: "Configura ANTHROPIC_API_KEY en las variables de entorno de Vercel.",
      severity: "error",
      retryable: false,
    },
  },
  {
    pattern: /Gemini API error.*403/i,
    diagnosis: {
      code: "GEMINI_FORBIDDEN",
      category: "api",
      title: "Clave de Gemini inválida",
      cause: "La API key de Gemini fue rechazada. Puede estar desactivada o ser incorrecta.",
      action: "Verifica la clave en Google AI Studio y actualízala en Vercel.",
      severity: "error",
      retryable: false,
    },
  },
  {
    pattern: /Gemini API error.*429/i,
    diagnosis: {
      code: "GEMINI_QUOTA",
      category: "api",
      title: "Límite de análisis de Gemini alcanzado",
      cause: "Se superó la cuota de requests de la API de Gemini.",
      action: "Espera unos minutos o actualiza tu plan de Google AI.",
      severity: "warning",
      retryable: true,
    },
  },
  {
    pattern: /Gemini no retornó respuesta/i,
    diagnosis: {
      code: "GEMINI_EMPTY_RESPONSE",
      category: "api",
      title: "Gemini no pudo analizar el video",
      cause: "La IA no generó observaciones. El video puede ser muy corto, oscuro, o no contener fútbol.",
      action: "Usa un video más largo (>10s) con buena iluminación y acción de juego visible.",
      severity: "warning",
      retryable: true,
    },
  },
  {
    pattern: /No se pudo parsear.*Gemini/i,
    diagnosis: {
      code: "GEMINI_PARSE_ERROR",
      category: "api",
      title: "Respuesta de Gemini inválida",
      cause: "La IA generó una respuesta que no se pudo interpretar.",
      action: "Reintenta el análisis. Si persiste, el video puede ser difícil de analizar.",
      severity: "warning",
      retryable: true,
    },
  },
  {
    pattern: /stream.*terminó sin resultado|No response body/i,
    diagnosis: {
      code: "CLAUDE_STREAM_FAILED",
      category: "api",
      title: "Error generando informe",
      cause: "La conexión con Claude se interrumpió antes de completar el informe.",
      action: "Reintenta el análisis. Si persiste, verifica tu conexión a internet.",
      severity: "error",
      retryable: true,
    },
  },
  {
    pattern: /Faltan datos requeridos/i,
    diagnosis: {
      code: "API_MISSING_DATA",
      category: "api",
      title: "Datos incompletos para el análisis",
      cause: "Faltan datos necesarios para ejecutar el análisis.",
      action: "Asegúrate de seleccionar un video y completar los campos requeridos.",
      severity: "error",
      retryable: false,
    },
  },

  // ── Auth ─────────────────────────────────────────────────────────────────
  {
    pattern: /Supabase no configurado/i,
    diagnosis: {
      code: "SUPABASE_NOT_CONFIGURED",
      category: "auth",
      title: "Base de datos no configurada",
      cause: "Faltan las variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.",
      action: "Configura las variables de Supabase en el archivo .env o Vercel.",
      severity: "error",
      retryable: false,
    },
  },
  {
    pattern: /Invalid login credentials/i,
    diagnosis: {
      code: "AUTH_INVALID_CREDENTIALS",
      category: "auth",
      title: "Credenciales incorrectas",
      cause: "El email o contraseña son incorrectos.",
      action: "Verifica tus datos. Si olvidaste tu contraseña, usa 'Olvidé mi contraseña'.",
      severity: "error",
      retryable: false,
    },
  },
  {
    pattern: /Email not confirmed/i,
    diagnosis: {
      code: "AUTH_EMAIL_NOT_CONFIRMED",
      category: "auth",
      title: "Email no verificado",
      cause: "Tu cuenta existe pero el email no ha sido confirmado.",
      action: "Revisa tu bandeja de entrada (y spam) y haz clic en el enlace de verificación.",
      severity: "warning",
      retryable: false,
    },
  },

  // ── Supabase / RLS ──────────────────────────────────────────────────────
  {
    pattern: /row-level security|RLS/i,
    diagnosis: {
      code: "SUPABASE_RLS",
      category: "supabase",
      title: "Error de permisos en la base de datos",
      cause: "Tu sesión puede haber expirado o no tienes permisos para esta acción.",
      action: "Cierra sesión e inicia de nuevo. Si persiste, contacta al administrador.",
      severity: "error",
      retryable: false,
    },
  },
  {
    pattern: /relation.*does not exist/i,
    diagnosis: {
      code: "SUPABASE_TABLE_MISSING",
      category: "supabase",
      title: "Tabla no encontrada",
      cause: "Falta ejecutar una migración SQL en Supabase.",
      action: "Ejecuta las migraciones pendientes en Supabase Dashboard > SQL Editor.",
      severity: "error",
      retryable: false,
    },
  },

  // ── Billing / Stripe ────────────────────────────────────────────────────
  {
    pattern: /Stripe no configurado/i,
    diagnosis: {
      code: "STRIPE_NOT_CONFIGURED",
      category: "billing",
      title: "Pagos no configurados",
      cause: "Faltan las variables de Stripe (publishable key, price IDs).",
      action: "Configura las variables VITE_STRIPE_* en Vercel.",
      severity: "warning",
      retryable: false,
    },
  },
  {
    pattern: /Límite.*alcanzado|plan.*limit/i,
    diagnosis: {
      code: "PLAN_LIMIT_REACHED",
      category: "billing",
      title: "Límite del plan alcanzado",
      cause: "Has llegado al máximo permitido por tu plan actual.",
      action: "Actualiza tu plan para obtener más capacidad.",
      severity: "warning",
      retryable: false,
    },
  },

  // ── Tracking / YOLO ─────────────────────────────────────────────────────
  {
    pattern: /WASM.*error|onnx.*error|model.*load/i,
    diagnosis: {
      code: "YOLO_MODEL_ERROR",
      category: "tracking",
      title: "Error cargando modelo de tracking",
      cause: "El modelo de detección no se pudo cargar. Puede ser un problema del navegador o memoria.",
      action: "Usa Chrome o Edge actualizado. Cierra otras pestañas para liberar memoria.",
      severity: "error",
      retryable: true,
    },
  },
];

// ── Servicio principal ───────────────────────────────────────────────────────

/**
 * Diagnostica un error y retorna causa raíz + acción sugerida.
 * 100% determinista — no usa IA, solo reglas de pattern matching.
 */
export function diagnoseError(
  error: unknown,
  context?: string
): ErrorDiagnosis {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(error);

  for (const rule of RULES) {
    if (rule.pattern.test(message)) {
      if (rule.context && context && !context.includes(rule.context)) continue;
      return rule.diagnosis;
    }
  }

  // Fallback genérico
  return {
    code: "UNKNOWN_ERROR",
    category: "unknown",
    title: "Error inesperado",
    cause: message.length > 200 ? message.slice(0, 200) + "…" : message,
    action: "Intenta de nuevo. Si el error persiste, contacta al soporte.",
    severity: "error",
    retryable: true,
  };
}

/**
 * Versión para usar en catch blocks — retorna un mensaje formateado para toast.
 */
export function getErrorMessage(error: unknown, context?: string): string {
  const diagnosis = diagnoseError(error, context);
  return diagnosis.title;
}

/**
 * Versión detallada — retorna título + acción para toasts con descripción.
 */
export function getErrorDetails(error: unknown, context?: string): {
  title: string;
  description: string;
  retryable: boolean;
} {
  const diagnosis = diagnoseError(error, context);
  return {
    title: diagnosis.title,
    description: diagnosis.action,
    retryable: diagnosis.retryable,
  };
}
