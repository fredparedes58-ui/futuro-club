/**
 * VITAS · Match job — textos de servidor en el locale del JOB
 *
 * El contrato exige que `gate_reason`, los motivos de cobertura y `job.error.message`
 * estén en el idioma del job (la UI los muestra tal cual). Los 7 idiomas del registro
 * (src/lib/shared/locale.ts). Todos los tiempos son «tiempo de vídeo», nunca minuto de
 * partido. Ningún texto incluye URLs, tokens ni valores de entorno.
 */
import { pickLocale, type ReportLocale } from "../../../src/lib/shared/locale";
import type {
  MatchAvailabilityResponse,
  MatchGateCode,
  MatchJobErrorCode,
  PossessionLowConfidenceCode,
} from "../../../src/lib/shared/matchJob/contract";

type AvailabilityCode = NonNullable<MatchAvailabilityResponse["code"]>;

type NotEvaluableReason =
  | "pre_kickoff"
  | "half_time"
  | "post_match"
  | "stoppage"
  | "camera_off_play"
  | "replay_or_graphics"
  | "poor_visibility"
  | "teams_indistinguishable"
  | "other";

/** Por qué falló / se saltó un tramo (detalle que acompaña a segment_failed / segment_skipped). */
export type SegmentFailureKind =
  | "max_tokens"
  | "invalid_output"
  | "timeout"
  | "provider_error"
  | "blocked"
  | "interrupted"
  | "budget"
  | "cancelled"
  | "job_failed"
  /** usageMetadata sin tokens de vídeo: la IA respondió sin ver el tramo (nada del tramo se usa). */
  | "no_visual_input";

interface Catalog {
  videoTime: string;
  gate: Record<MatchGateCode, string>;
  failure: Record<SegmentFailureKind, string>;
  notEvaluable: Record<NotEvaluableReason, string>;
  gapNotEvaluable: string;
  gapAmbiguous: string;
  possessionLowConfidence: Record<PossessionLowConfidenceCode, string>;
  availability: Record<AvailabilityCode, string>;
  jobError: Record<MatchJobErrorCode, string>;
}

const es: Catalog = {
  videoTime: "tiempo de vídeo",
  gate: {
    segment_pending: "Tramo {range} ({videoTime}) pendiente de analizar.",
    segment_running: "Tramo {range} ({videoTime}) en análisis.",
    segment_failed: "Tramo {range} ({videoTime}) no analizado: {detail}.",
    segment_skipped: "Tramo {range} ({videoTime}) no analizado: {detail}.",
    teams_ambiguous: "Tramo {range}: la IA no pudo distinguir los equipos por los colores declarados.",
    not_evaluated_by_model: "La IA no pudo evaluar este aspecto en el tramo {range}.",
    invalid_model_value: "La IA devolvió un valor fuera del formato esperado en el tramo {range}; no se muestra.",
    possession_missing: "La IA no estimó la posesión en el tramo {range}.",
    possession_incoherent: "La posesión estimada por la IA en el tramo {range} no suma 100 %; se descarta.",
    no_usable_segments: "Ningún tramo analizado permite esta estimación.",
    duration_unknown: "Duración del vídeo desconocida (Bunny aún no la reporta).",
    report_no_analysed_segments: "No se generó informe: ningún tramo del vídeo pudo analizarse.",
    report_engine_unavailable: "Informe no disponible: el motor de redacción no está configurado. La observación y las evidencias siguen disponibles.",
    report_engine_error: "No se pudo generar el informe ({detail}). La observación y las evidencias siguen disponibles.",
    report_budget_exhausted: "Informe no generado: presupuesto mensual de IA agotado.",
  },
  failure: {
    max_tokens: "respuesta truncada (MAX_TOKENS) tras {n} intentos",
    invalid_output: "respuesta de la IA no válida tras {n} intentos",
    timeout: "tiempo de espera agotado tras {n} intentos",
    provider_error: "error del servicio de IA tras {n} intentos",
    blocked: "respuesta bloqueada por el proveedor de IA",
    interrupted: "análisis interrumpido {n} veces",
    budget: "presupuesto mensual de IA agotado antes de este tramo",
    cancelled: "análisis cancelado",
    job_failed: "el análisis terminó antes de este tramo",
    no_visual_input: "la IA respondió sin confirmar que recibió el vídeo del tramo (tras {n} intentos)",
  },
  notEvaluable: {
    pre_kickoff: "antes del inicio",
    half_time: "descanso",
    post_match: "después del final",
    stoppage: "juego detenido",
    camera_off_play: "cámara fuera del juego",
    replay_or_graphics: "repetición o gráficos",
    poor_visibility: "visibilidad insuficiente",
    teams_indistinguishable: "equipos no distinguibles",
    other: "otro motivo",
  },
  gapNotEvaluable: "{range}: {label} (según la IA)",
  gapAmbiguous: "{range}: equipos no distinguibles por los colores declarados (según la IA)",
  possessionLowConfidence: {
    no_visual_basis: "Posesión de baja confianza: en los tramos {segments} la respuesta de la IA no se puede ligar a lo que vio (sin confirmación de vídeo o sin ninguna evidencia citada).",
    uniform_output: "Posesión de baja confianza: la IA devolvió 50 % – 50 % y «equilibrado» en todos los tramos, indistinguible de un valor por defecto.",
  },
  availability: {
    match_video_disabled: "Análisis de partido completo en validación: el motor de observación por vídeo aún no ha superado la validación con partidos anotados a mano. El informe con notas sigue disponible.",
    real_inference_disabled: "Análisis de partido completo no disponible: falta configuración del servidor. El informe con notas sigue disponible.",
  },
  jobError: {
    encode_failed: "Bunny no pudo codificar el vídeo.",
    encode_timeout: "La codificación del vídeo en Bunny no terminó a tiempo.",
    video_too_long: "El vídeo supera la duración máxima de un partido admitida.",
    dispatch_exhausted: "No se pudo arrancar el procesado del vídeo tras varios intentos.",
    source_forbidden: "El servidor de vídeo denegó el acceso al fichero.",
    source_unavailable: "El vídeo no está disponible en una calidad procesable.",
    transcode_failed: "No se pudo preparar el vídeo para el análisis.",
    duration_mismatch: "La duración del vídeo preparado no coincide con la del original.",
    proxy_too_large: "El vídeo preparado supera el tamaño máximo admitido por el servicio de IA.",
    gemini_upload_failed: "No se pudo subir el vídeo preparado al servicio de IA.",
    gemini_file_failed: "El servicio de IA no pudo procesar el vídeo.",
    budget_exhausted: "Presupuesto mensual de IA agotado: se conservan los tramos ya analizados.",
    analysis_disabled: "El análisis de partido completo se desactivó en el servidor (en validación); se conservan los tramos ya analizados.",
    worker_failed: "El procesado del vídeo falló.",
    deadline_exceeded: "El procesado del vídeo superó el tiempo máximo.",
    internal_error: "Error interno del análisis de partido.",
  },
};

const en: Catalog = {
  videoTime: "video time",
  gate: {
    segment_pending: "Segment {range} ({videoTime}) not analysed yet.",
    segment_running: "Segment {range} ({videoTime}) being analysed.",
    segment_failed: "Segment {range} ({videoTime}) not analysed: {detail}.",
    segment_skipped: "Segment {range} ({videoTime}) not analysed: {detail}.",
    teams_ambiguous: "Segment {range}: the AI could not tell the teams apart by the declared kit colours.",
    not_evaluated_by_model: "The AI could not assess this aspect in segment {range}.",
    invalid_model_value: "The AI returned a value outside the expected format in segment {range}; not shown.",
    possession_missing: "The AI did not estimate possession in segment {range}.",
    possession_incoherent: "The AI possession estimate for segment {range} does not add up to 100%; discarded.",
    no_usable_segments: "No analysed segment supports this estimate.",
    duration_unknown: "Video duration unknown (Bunny has not reported it yet).",
    report_no_analysed_segments: "No report generated: no segment of the video could be analysed.",
    report_engine_unavailable: "Report unavailable: the writing engine is not configured. The observation and evidence are still available.",
    report_engine_error: "The report could not be generated ({detail}). The observation and evidence are still available.",
    report_budget_exhausted: "Report not generated: monthly AI budget exhausted.",
  },
  failure: {
    max_tokens: "truncated response (MAX_TOKENS) after {n} attempts",
    invalid_output: "invalid AI response after {n} attempts",
    timeout: "timed out after {n} attempts",
    provider_error: "AI service error after {n} attempts",
    blocked: "response blocked by the AI provider",
    interrupted: "analysis interrupted {n} times",
    budget: "monthly AI budget exhausted before this segment",
    cancelled: "analysis cancelled",
    job_failed: "the analysis ended before this segment",
    no_visual_input: "the AI answered without confirming it received this segment's video (after {n} attempts)",
  },
  notEvaluable: {
    pre_kickoff: "before kick-off",
    half_time: "half-time",
    post_match: "after the final whistle",
    stoppage: "play stopped",
    camera_off_play: "camera away from play",
    replay_or_graphics: "replay or graphics",
    poor_visibility: "poor visibility",
    teams_indistinguishable: "teams indistinguishable",
    other: "other reason",
  },
  gapNotEvaluable: "{range}: {label} (according to the AI)",
  gapAmbiguous: "{range}: teams indistinguishable by the declared kit colours (according to the AI)",
  possessionLowConfidence: {
    no_visual_basis: "Low-confidence possession: in segments {segments} the AI answer cannot be tied to what it saw (no video confirmation or no cited evidence).",
    uniform_output: "Low-confidence possession: the AI returned 50% – 50% and “balanced” in every segment, indistinguishable from a default value.",
  },
  availability: {
    match_video_disabled: "Full-match analysis under validation: the video observation engine has not yet passed validation against hand-annotated matches. The notes-only report is still available.",
    real_inference_disabled: "Full-match analysis unavailable: the server configuration is incomplete. The notes-only report is still available.",
  },
  jobError: {
    encode_failed: "Bunny could not encode the video.",
    encode_timeout: "Bunny did not finish encoding the video in time.",
    video_too_long: "The video exceeds the maximum match duration accepted.",
    dispatch_exhausted: "Video processing could not be started after several attempts.",
    source_forbidden: "The video server denied access to the file.",
    source_unavailable: "The video is not available in a processable quality.",
    transcode_failed: "The video could not be prepared for analysis.",
    duration_mismatch: "The prepared video's duration does not match the original.",
    proxy_too_large: "The prepared video exceeds the maximum size accepted by the AI service.",
    gemini_upload_failed: "The prepared video could not be uploaded to the AI service.",
    gemini_file_failed: "The AI service could not process the video.",
    budget_exhausted: "Monthly AI budget exhausted: segments already analysed are kept.",
    analysis_disabled: "Full-match analysis was switched off on the server (under validation); segments already analysed are kept.",
    worker_failed: "Video processing failed.",
    deadline_exceeded: "Video processing exceeded the maximum time.",
    internal_error: "Internal error in the match analysis.",
  },
};

const it: Catalog = {
  videoTime: "tempo video",
  gate: {
    segment_pending: "Segmento {range} ({videoTime}) in attesa di analisi.",
    segment_running: "Segmento {range} ({videoTime}) in analisi.",
    segment_failed: "Segmento {range} ({videoTime}) non analizzato: {detail}.",
    segment_skipped: "Segmento {range} ({videoTime}) non analizzato: {detail}.",
    teams_ambiguous: "Segmento {range}: l'IA non ha potuto distinguere le squadre dai colori dichiarati.",
    not_evaluated_by_model: "L'IA non ha potuto valutare questo aspetto nel segmento {range}.",
    invalid_model_value: "L'IA ha restituito un valore fuori formato nel segmento {range}; non viene mostrato.",
    possession_missing: "L'IA non ha stimato il possesso nel segmento {range}.",
    possession_incoherent: "Il possesso stimato dall'IA nel segmento {range} non somma 100%; scartato.",
    no_usable_segments: "Nessun segmento analizzato consente questa stima.",
    duration_unknown: "Durata del video sconosciuta (Bunny non l'ha ancora comunicata).",
    report_no_analysed_segments: "Nessun report generato: nessun segmento del video è stato analizzato.",
    report_engine_unavailable: "Report non disponibile: il motore di redazione non è configurato. Osservazione ed evidenze restano disponibili.",
    report_engine_error: "Impossibile generare il report ({detail}). Osservazione ed evidenze restano disponibili.",
    report_budget_exhausted: "Report non generato: budget mensile di IA esaurito.",
  },
  failure: {
    max_tokens: "risposta troncata (MAX_TOKENS) dopo {n} tentativi",
    invalid_output: "risposta dell'IA non valida dopo {n} tentativi",
    timeout: "tempo scaduto dopo {n} tentativi",
    provider_error: "errore del servizio di IA dopo {n} tentativi",
    blocked: "risposta bloccata dal fornitore di IA",
    interrupted: "analisi interrotta {n} volte",
    budget: "budget mensile di IA esaurito prima di questo segmento",
    cancelled: "analisi annullata",
    job_failed: "l'analisi è terminata prima di questo segmento",
    no_visual_input: "l'IA ha risposto senza confermare di aver ricevuto il video del segmento (dopo {n} tentativi)",
  },
  notEvaluable: {
    pre_kickoff: "prima del calcio d'inizio",
    half_time: "intervallo",
    post_match: "dopo il fischio finale",
    stoppage: "gioco fermo",
    camera_off_play: "telecamera lontana dal gioco",
    replay_or_graphics: "replay o grafiche",
    poor_visibility: "visibilità insufficiente",
    teams_indistinguishable: "squadre non distinguibili",
    other: "altro motivo",
  },
  gapNotEvaluable: "{range}: {label} (secondo l'IA)",
  gapAmbiguous: "{range}: squadre non distinguibili dai colori dichiarati (secondo l'IA)",
  possessionLowConfidence: {
    no_visual_basis: "Possesso a bassa affidabilità: nei segmenti {segments} la risposta dell'IA non si può collegare a ciò che ha visto (nessuna conferma del video o nessuna evidenza citata).",
    uniform_output: "Possesso a bassa affidabilità: l'IA ha restituito 50% – 50% e «equilibrato» in tutti i segmenti, indistinguibile da un valore predefinito.",
  },
  availability: {
    match_video_disabled: "Analisi della partita completa in fase di validazione: il motore di osservazione video non ha ancora superato la validazione con partite annotate a mano. Il report con le note resta disponibile.",
    real_inference_disabled: "Analisi della partita completa non disponibile: configurazione del server incompleta. Il report con le note resta disponibile.",
  },
  jobError: {
    encode_failed: "Bunny non è riuscito a codificare il video.",
    encode_timeout: "La codifica del video su Bunny non è terminata in tempo.",
    video_too_long: "Il video supera la durata massima di una partita consentita.",
    dispatch_exhausted: "Non è stato possibile avviare l'elaborazione del video dopo vari tentativi.",
    source_forbidden: "Il server video ha negato l'accesso al file.",
    source_unavailable: "Il video non è disponibile in una qualità elaborabile.",
    transcode_failed: "Non è stato possibile preparare il video per l'analisi.",
    duration_mismatch: "La durata del video preparato non coincide con quella dell'originale.",
    proxy_too_large: "Il video preparato supera la dimensione massima accettata dal servizio di IA.",
    gemini_upload_failed: "Non è stato possibile caricare il video preparato sul servizio di IA.",
    gemini_file_failed: "Il servizio di IA non è riuscito a elaborare il video.",
    budget_exhausted: "Budget mensile di IA esaurito: i segmenti già analizzati vengono conservati.",
    analysis_disabled: "L'analisi della partita completa è stata disattivata sul server (in fase di validazione); i segmenti già analizzati vengono conservati.",
    worker_failed: "L'elaborazione del video non è riuscita.",
    deadline_exceeded: "L'elaborazione del video ha superato il tempo massimo.",
    internal_error: "Errore interno dell'analisi della partita.",
  },
};

const fr: Catalog = {
  videoTime: "temps vidéo",
  gate: {
    segment_pending: "Segment {range} ({videoTime}) en attente d'analyse.",
    segment_running: "Segment {range} ({videoTime}) en cours d'analyse.",
    segment_failed: "Segment {range} ({videoTime}) non analysé : {detail}.",
    segment_skipped: "Segment {range} ({videoTime}) non analysé : {detail}.",
    teams_ambiguous: "Segment {range} : l'IA n'a pas pu distinguer les équipes par les couleurs déclarées.",
    not_evaluated_by_model: "L'IA n'a pas pu évaluer cet aspect dans le segment {range}.",
    invalid_model_value: "L'IA a renvoyé une valeur hors format dans le segment {range} ; non affichée.",
    possession_missing: "L'IA n'a pas estimé la possession dans le segment {range}.",
    possession_incoherent: "La possession estimée par l'IA dans le segment {range} ne fait pas 100 % ; écartée.",
    no_usable_segments: "Aucun segment analysé ne permet cette estimation.",
    duration_unknown: "Durée de la vidéo inconnue (Bunny ne l'a pas encore communiquée).",
    report_no_analysed_segments: "Aucun rapport généré : aucun segment de la vidéo n'a pu être analysé.",
    report_engine_unavailable: "Rapport indisponible : le moteur de rédaction n'est pas configuré. L'observation et les preuves restent disponibles.",
    report_engine_error: "Le rapport n'a pas pu être généré ({detail}). L'observation et les preuves restent disponibles.",
    report_budget_exhausted: "Rapport non généré : budget mensuel d'IA épuisé.",
  },
  failure: {
    max_tokens: "réponse tronquée (MAX_TOKENS) après {n} tentatives",
    invalid_output: "réponse de l'IA invalide après {n} tentatives",
    timeout: "délai dépassé après {n} tentatives",
    provider_error: "erreur du service d'IA après {n} tentatives",
    blocked: "réponse bloquée par le fournisseur d'IA",
    interrupted: "analyse interrompue {n} fois",
    budget: "budget mensuel d'IA épuisé avant ce segment",
    cancelled: "analyse annulée",
    job_failed: "l'analyse s'est terminée avant ce segment",
    no_visual_input: "l'IA a répondu sans confirmer avoir reçu la vidéo du segment (après {n} tentatives)",
  },
  notEvaluable: {
    pre_kickoff: "avant le coup d'envoi",
    half_time: "mi-temps",
    post_match: "après le coup de sifflet final",
    stoppage: "jeu arrêté",
    camera_off_play: "caméra hors du jeu",
    replay_or_graphics: "ralenti ou graphiques",
    poor_visibility: "visibilité insuffisante",
    teams_indistinguishable: "équipes indiscernables",
    other: "autre motif",
  },
  gapNotEvaluable: "{range} : {label} (selon l'IA)",
  gapAmbiguous: "{range} : équipes indiscernables par les couleurs déclarées (selon l'IA)",
  possessionLowConfidence: {
    no_visual_basis: "Possession à faible confiance : dans les segments {segments}, la réponse de l'IA ne peut pas être reliée à ce qu'elle a vu (aucune confirmation vidéo ou aucune preuve citée).",
    uniform_output: "Possession à faible confiance : l'IA a renvoyé 50 % – 50 % et « équilibré » dans tous les segments, impossible à distinguer d'une valeur par défaut.",
  },
  availability: {
    match_video_disabled: "Analyse du match complet en validation : le moteur d'observation vidéo n'a pas encore passé la validation sur des matchs annotés à la main. Le rapport à partir des notes reste disponible.",
    real_inference_disabled: "Analyse du match complet indisponible : configuration du serveur incomplète. Le rapport à partir des notes reste disponible.",
  },
  jobError: {
    encode_failed: "Bunny n'a pas pu encoder la vidéo.",
    encode_timeout: "L'encodage de la vidéo sur Bunny ne s'est pas terminé à temps.",
    video_too_long: "La vidéo dépasse la durée maximale de match acceptée.",
    dispatch_exhausted: "Le traitement de la vidéo n'a pas pu démarrer après plusieurs tentatives.",
    source_forbidden: "Le serveur vidéo a refusé l'accès au fichier.",
    source_unavailable: "La vidéo n'est pas disponible dans une qualité exploitable.",
    transcode_failed: "La vidéo n'a pas pu être préparée pour l'analyse.",
    duration_mismatch: "La durée de la vidéo préparée ne correspond pas à celle de l'original.",
    proxy_too_large: "La vidéo préparée dépasse la taille maximale acceptée par le service d'IA.",
    gemini_upload_failed: "La vidéo préparée n'a pas pu être envoyée au service d'IA.",
    gemini_file_failed: "Le service d'IA n'a pas pu traiter la vidéo.",
    budget_exhausted: "Budget mensuel d'IA épuisé : les segments déjà analysés sont conservés.",
    analysis_disabled: "L'analyse du match complet a été désactivée sur le serveur (en validation) ; les segments déjà analysés sont conservés.",
    worker_failed: "Le traitement de la vidéo a échoué.",
    deadline_exceeded: "Le traitement de la vidéo a dépassé la durée maximale.",
    internal_error: "Erreur interne de l'analyse du match.",
  },
};

const de: Catalog = {
  videoTime: "Videozeit",
  gate: {
    segment_pending: "Abschnitt {range} ({videoTime}) noch nicht analysiert.",
    segment_running: "Abschnitt {range} ({videoTime}) wird analysiert.",
    segment_failed: "Abschnitt {range} ({videoTime}) nicht analysiert: {detail}.",
    segment_skipped: "Abschnitt {range} ({videoTime}) nicht analysiert: {detail}.",
    teams_ambiguous: "Abschnitt {range}: Die KI konnte die Teams anhand der angegebenen Trikotfarben nicht unterscheiden.",
    not_evaluated_by_model: "Die KI konnte diesen Aspekt im Abschnitt {range} nicht bewerten.",
    invalid_model_value: "Die KI lieferte im Abschnitt {range} einen Wert außerhalb des erwarteten Formats; wird nicht angezeigt.",
    possession_missing: "Die KI hat den Ballbesitz im Abschnitt {range} nicht geschätzt.",
    possession_incoherent: "Der von der KI geschätzte Ballbesitz im Abschnitt {range} ergibt nicht 100 %; verworfen.",
    no_usable_segments: "Kein analysierter Abschnitt erlaubt diese Schätzung.",
    duration_unknown: "Videodauer unbekannt (Bunny hat sie noch nicht gemeldet).",
    report_no_analysed_segments: "Kein Bericht erstellt: Kein Abschnitt des Videos konnte analysiert werden.",
    report_engine_unavailable: "Bericht nicht verfügbar: Die Berichts-Engine ist nicht konfiguriert. Beobachtung und Belege bleiben verfügbar.",
    report_engine_error: "Der Bericht konnte nicht erstellt werden ({detail}). Beobachtung und Belege bleiben verfügbar.",
    report_budget_exhausted: "Kein Bericht erstellt: monatliches KI-Budget ausgeschöpft.",
  },
  failure: {
    max_tokens: "abgeschnittene Antwort (MAX_TOKENS) nach {n} Versuchen",
    invalid_output: "ungültige KI-Antwort nach {n} Versuchen",
    timeout: "Zeitüberschreitung nach {n} Versuchen",
    provider_error: "Fehler des KI-Dienstes nach {n} Versuchen",
    blocked: "Antwort vom KI-Anbieter blockiert",
    interrupted: "Analyse {n}-mal unterbrochen",
    budget: "monatliches KI-Budget vor diesem Abschnitt ausgeschöpft",
    cancelled: "Analyse abgebrochen",
    job_failed: "die Analyse endete vor diesem Abschnitt",
    no_visual_input: "die KI hat geantwortet, ohne zu bestätigen, dass sie das Video des Abschnitts erhalten hat (nach {n} Versuchen)",
  },
  notEvaluable: {
    pre_kickoff: "vor dem Anstoß",
    half_time: "Halbzeitpause",
    post_match: "nach dem Abpfiff",
    stoppage: "Spielunterbrechung",
    camera_off_play: "Kamera nicht auf dem Spiel",
    replay_or_graphics: "Wiederholung oder Grafiken",
    poor_visibility: "schlechte Sicht",
    teams_indistinguishable: "Teams nicht unterscheidbar",
    other: "anderer Grund",
  },
  gapNotEvaluable: "{range}: {label} (laut KI)",
  gapAmbiguous: "{range}: Teams anhand der angegebenen Trikotfarben nicht unterscheidbar (laut KI)",
  possessionLowConfidence: {
    no_visual_basis: "Ballbesitz mit geringer Zuverlässigkeit: in den Abschnitten {segments} lässt sich die KI-Antwort nicht mit dem Gesehenen verknüpfen (keine Videobestätigung oder kein zitierter Beleg).",
    uniform_output: "Ballbesitz mit geringer Zuverlässigkeit: die KI lieferte in allen Abschnitten 50 % – 50 % und „ausgeglichen“, nicht von einem Standardwert zu unterscheiden.",
  },
  availability: {
    match_video_disabled: "Analyse des ganzen Spiels in Validierung: die Video-Beobachtung hat die Validierung mit von Hand annotierten Spielen noch nicht bestanden. Der Bericht aus Notizen bleibt verfügbar.",
    real_inference_disabled: "Analyse des ganzen Spiels nicht verfügbar: die Serverkonfiguration ist unvollständig. Der Bericht aus Notizen bleibt verfügbar.",
  },
  jobError: {
    encode_failed: "Bunny konnte das Video nicht kodieren.",
    encode_timeout: "Die Kodierung des Videos bei Bunny wurde nicht rechtzeitig abgeschlossen.",
    video_too_long: "Das Video überschreitet die maximal zulässige Spieldauer.",
    dispatch_exhausted: "Die Videoverarbeitung konnte nach mehreren Versuchen nicht gestartet werden.",
    source_forbidden: "Der Videoserver hat den Zugriff auf die Datei verweigert.",
    source_unavailable: "Das Video ist nicht in einer verarbeitbaren Qualität verfügbar.",
    transcode_failed: "Das Video konnte nicht für die Analyse vorbereitet werden.",
    duration_mismatch: "Die Dauer des vorbereiteten Videos stimmt nicht mit dem Original überein.",
    proxy_too_large: "Das vorbereitete Video überschreitet die vom KI-Dienst akzeptierte Maximalgröße.",
    gemini_upload_failed: "Das vorbereitete Video konnte nicht zum KI-Dienst hochgeladen werden.",
    gemini_file_failed: "Der KI-Dienst konnte das Video nicht verarbeiten.",
    budget_exhausted: "Monatliches KI-Budget ausgeschöpft: bereits analysierte Abschnitte bleiben erhalten.",
    analysis_disabled: "Die Analyse des ganzen Spiels wurde auf dem Server abgeschaltet (in Validierung); bereits analysierte Abschnitte bleiben erhalten.",
    worker_failed: "Die Videoverarbeitung ist fehlgeschlagen.",
    deadline_exceeded: "Die Videoverarbeitung hat die maximale Zeit überschritten.",
    internal_error: "Interner Fehler der Spielanalyse.",
  },
};

const nl: Catalog = {
  videoTime: "videotijd",
  gate: {
    segment_pending: "Segment {range} ({videoTime}) nog niet geanalyseerd.",
    segment_running: "Segment {range} ({videoTime}) wordt geanalyseerd.",
    segment_failed: "Segment {range} ({videoTime}) niet geanalyseerd: {detail}.",
    segment_skipped: "Segment {range} ({videoTime}) niet geanalyseerd: {detail}.",
    teams_ambiguous: "Segment {range}: de AI kon de teams niet onderscheiden aan de opgegeven tenuekleuren.",
    not_evaluated_by_model: "De AI kon dit aspect in segment {range} niet beoordelen.",
    invalid_model_value: "De AI gaf in segment {range} een waarde buiten het verwachte formaat; wordt niet getoond.",
    possession_missing: "De AI heeft het balbezit in segment {range} niet geschat.",
    possession_incoherent: "Het door de AI geschatte balbezit in segment {range} telt niet op tot 100%; verworpen.",
    no_usable_segments: "Geen enkel geanalyseerd segment maakt deze schatting mogelijk.",
    duration_unknown: "Videoduur onbekend (Bunny heeft die nog niet gemeld).",
    report_no_analysed_segments: "Geen rapport gemaakt: geen enkel segment van de video kon worden geanalyseerd.",
    report_engine_unavailable: "Rapport niet beschikbaar: de rapportage-engine is niet geconfigureerd. De observatie en het bewijs blijven beschikbaar.",
    report_engine_error: "Het rapport kon niet worden gemaakt ({detail}). De observatie en het bewijs blijven beschikbaar.",
    report_budget_exhausted: "Geen rapport gemaakt: maandelijks AI-budget op.",
  },
  failure: {
    max_tokens: "afgekapt antwoord (MAX_TOKENS) na {n} pogingen",
    invalid_output: "ongeldig AI-antwoord na {n} pogingen",
    timeout: "time-out na {n} pogingen",
    provider_error: "fout van de AI-dienst na {n} pogingen",
    blocked: "antwoord geblokkeerd door de AI-aanbieder",
    interrupted: "analyse {n} keer onderbroken",
    budget: "maandelijks AI-budget op vóór dit segment",
    cancelled: "analyse geannuleerd",
    job_failed: "de analyse eindigde vóór dit segment",
    no_visual_input: "de AI antwoordde zonder te bevestigen dat de video van het segment ontvangen was (na {n} pogingen)",
  },
  notEvaluable: {
    pre_kickoff: "vóór de aftrap",
    half_time: "rust",
    post_match: "na het eindsignaal",
    stoppage: "spel stilgelegd",
    camera_off_play: "camera niet op het spel",
    replay_or_graphics: "herhaling of graphics",
    poor_visibility: "slecht zicht",
    teams_indistinguishable: "teams niet te onderscheiden",
    other: "andere reden",
  },
  gapNotEvaluable: "{range}: {label} (volgens de AI)",
  gapAmbiguous: "{range}: teams niet te onderscheiden aan de opgegeven tenuekleuren (volgens de AI)",
  possessionLowConfidence: {
    no_visual_basis: "Balbezit met lage betrouwbaarheid: in segmenten {segments} is het AI-antwoord niet te koppelen aan wat het zag (geen videobevestiging of geen geciteerd bewijs).",
    uniform_output: "Balbezit met lage betrouwbaarheid: de AI gaf in alle segmenten 50% – 50% en ‘gelijkwaardig’, niet te onderscheiden van een standaardwaarde.",
  },
  availability: {
    match_video_disabled: "Analyse van de volledige wedstrijd in validatie: de video-observatie is nog niet gevalideerd met handmatig geannoteerde wedstrijden. Het rapport op basis van notities blijft beschikbaar.",
    real_inference_disabled: "Analyse van de volledige wedstrijd niet beschikbaar: de serverconfiguratie is onvolledig. Het rapport op basis van notities blijft beschikbaar.",
  },
  jobError: {
    encode_failed: "Bunny kon de video niet coderen.",
    encode_timeout: "Het coderen van de video bij Bunny was niet op tijd klaar.",
    video_too_long: "De video is langer dan de maximaal toegestane wedstrijdduur.",
    dispatch_exhausted: "De videoverwerking kon na meerdere pogingen niet worden gestart.",
    source_forbidden: "De videoserver weigerde toegang tot het bestand.",
    source_unavailable: "De video is niet beschikbaar in een verwerkbare kwaliteit.",
    transcode_failed: "De video kon niet worden voorbereid voor de analyse.",
    duration_mismatch: "De duur van de voorbereide video komt niet overeen met het origineel.",
    proxy_too_large: "De voorbereide video is groter dan de AI-dienst accepteert.",
    gemini_upload_failed: "De voorbereide video kon niet naar de AI-dienst worden geüpload.",
    gemini_file_failed: "De AI-dienst kon de video niet verwerken.",
    budget_exhausted: "Maandelijks AI-budget op: reeds geanalyseerde segmenten blijven behouden.",
    analysis_disabled: "De analyse van de volledige wedstrijd is op de server uitgeschakeld (in validatie); reeds geanalyseerde segmenten blijven behouden.",
    worker_failed: "De videoverwerking is mislukt.",
    deadline_exceeded: "De videoverwerking duurde langer dan de maximale tijd.",
    internal_error: "Interne fout in de wedstrijdanalyse.",
  },
};

const CATALOGS: Partial<Record<ReportLocale, Catalog>> = { es, "es-419": es, en, it, fr, de, nl };

function cat(locale: ReportLocale): Catalog {
  return pickLocale(locale, CATALOGS);
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

const SEC_PER_MIN = 60;
const SEC_PER_HOUR = 3600;

/** «tiempo de vídeo» en m:ss (o h:mm:ss a partir de una hora). */
export function formatVideoTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / SEC_PER_HOUR);
  const m = Math.floor((s % SEC_PER_HOUR) / SEC_PER_MIN);
  const ss = String(s % SEC_PER_MIN).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatRange(startSec: number, endSec: number): string {
  return `${formatVideoTime(startSec)}–${formatVideoTime(endSec)}`;
}

export function segmentFailureDetail(locale: ReportLocale, kind: SegmentFailureKind, attempts: number): string {
  return fill(cat(locale).failure[kind], { n: attempts });
}

/** gate_reason en el locale del job. `range` = tramo del vídeo; `detail` = motivo concreto. */
export function gateReason(
  locale: ReportLocale,
  code: MatchGateCode,
  params: { startSec?: number; endSec?: number; detail?: string } = {},
): string {
  const c = cat(locale);
  const range =
    params.startSec !== undefined && params.endSec !== undefined ? formatRange(params.startSec, params.endSec) : "";
  return fill(c.gate[code], { range, detail: params.detail ?? "", videoTime: c.videoTime });
}

export function notEvaluableGapReason(locale: ReportLocale, reason: NotEvaluableReason, startSec: number, endSec: number): string {
  const c = cat(locale);
  return fill(c.gapNotEvaluable, { range: formatRange(startSec, endSec), label: c.notEvaluable[reason] });
}

export function ambiguousGapReason(locale: ReportLocale, startSec: number, endSec: number): string {
  return fill(cat(locale).gapAmbiguous, { range: formatRange(startSec, endSec) });
}

export function jobErrorMessage(locale: ReportLocale, code: MatchJobErrorCode): string {
  return cat(locale).jobError[code];
}

/** Motivo (locale del job) de una posesión de baja confianza; `segments` = tramos afectados (tiempo de vídeo). */
export function possessionLowConfidenceReason(
  locale: ReportLocale,
  code: PossessionLowConfidenceCode,
  segments: readonly { start_sec: number; end_sec: number }[],
): string {
  return fill(cat(locale).possessionLowConfidence[code], {
    segments: segments.map((s) => formatRange(s.start_sec, s.end_sec)).join(", "),
  });
}

/** Por qué la ruta de vídeo no se ofrece (GET /api/match/availability y 503 de /start). */
export function availabilityReason(locale: ReportLocale, code: AvailabilityCode): string {
  return cat(locale).availability[code];
}

/** Para tests de paridad: claves de cada catálogo. */
export const MESSAGE_CATALOGS_FOR_TEST = CATALOGS;
