/**
 * ValuationExportService — CSV export for valuation data
 *
 * Generates CSV with:
 * - Player name, age, position, PHV offset
 * - VSI, injury risk, tier, overall score
 * - Probabilities (1st div, top-5)
 *
 * Club plan only.
 *
 * Sprint 13: Valuation Dashboard & Integration
 */

import type { TeamPlayerValuation } from "@/components/valuation/TeamValuationRanking";

export const ValuationExportService = {
  /**
   * Generate and download CSV from valuation data.
   */
  exportCSV(players: TeamPlayerValuation[], filename?: string): void {
    const headers = [
      "Nombre",
      "Posicion",
      "Edad",
      "VSI",
      "Riesgo Lesion",
      "Tier",
      "Score Valoracion",
    ];

    const rows = players
      .sort((a, b) => b.overallScore - a.overallScore)
      .map((p) => [
        p.name,
        p.position,
        p.age?.toString() ?? "",
        p.vsi?.toString() ?? "",
        p.injuryRisk?.toString() ?? "",
        p.tier,
        p.overallScore.toString(),
      ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename ?? `vitas_valoracion_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};
