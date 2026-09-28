/**
 * Contexto con la advertencia de identidad del análisis que se está mostrando
 * (src/lib/reports/analysisIdentity.ts). Lo provee AnalysisDashboard; lo consume
 * ReportConfidenceChip, de modo que TODOS los informes del análisis —también los que
 * pintan su propio chip (ADN, best-match)— reducen su confianza sin cambiar la firma
 * de cada renderer. Sin proveedor (p. ej. informe de equipo) ⇒ null ⇒ sin reducción.
 */
import { createContext } from "react";
import type { AnalysisIdentityCaveat } from "@/lib/reports/analysisIdentity";

export const IdentityCaveatContext = createContext<AnalysisIdentityCaveat | null>(null);
