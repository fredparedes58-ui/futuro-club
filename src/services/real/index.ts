/**
 * VITAS · Services Barrel Export
 *
 * Re-exporta todos los servicios principales para imports limpios:
 *   import { PlayerService, MetricsService } from "@/services/real";
 */

// Core data
export { PlayerService } from "./playerService";
export { MetricsService } from "./metricsService";
export { StorageService } from "./storageService";
export { TeamService } from "./teamService";

// AI & Agents
export { AgentService } from "./agentService";
export { agentTracer } from "./agentTracer";
export { observability } from "./observabilityAdapter";

// Advanced metrics & analysis
export { RAEService, UBIService, TruthFilterService, VAEPService, DominantFeaturesService, TrackingService } from "./advancedMetricsService";
export { SimilarityService } from "./similarityService";

// Validation & diagnostics
export { validatePlayerReport, validateTeamReport, validatePHVOutput } from "./reportValidator";
export { AuditService } from "./auditService";

// Resilience
export * from "./agentResilience";

// RAG
export { ragService } from "./ragService";
export { smartChunker } from "./smartChunker";

// Video & media
export { videoService } from "./videoService";

// Sync & storage
export { syncQueueService } from "./syncQueueService";

// Subscriptions
export { subscriptionService } from "./subscriptionService";

// Types
export type { AgentTrace, AgentMetrics, TracerAlert } from "./agentTracer";
export type { ObservabilityProvider } from "./observabilityAdapter";
export type { ValidationResult, ValidationIssue } from "./reportValidator";
export type { AuditReport, AuditSection, AuditCheck, AuditStatus } from "./auditService";
