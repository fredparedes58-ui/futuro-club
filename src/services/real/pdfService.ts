/**
 * VITAS — PDF Export Service
 * Usa window.print() con layout de impresión dedicado.
 * Más robusto que html2canvas con CSS custom properties de Tailwind.
 */

export interface PDFExportOptions {
  playerId: string;
  playerName: string;
}

export const PDFService = {
  /**
   * Abre la vista de impresión del perfil del jugador.
   * El layout /report/:id se optimiza con @media print.
   */
  exportPlayerReport(playerId: string): void {
    // Open print-optimized route in new tab
    const url = `/report/${playerId}`;
    const win = window.open(url, "_blank");
    if (!win) {
      // Fallback: navigate current page to print route
      window.location.href = url;
    }
  },

  /**
   * Descarga el informe del jugador como imagen PNG usando html2canvas.
   * Abre /report/:id?format=image en nueva pestaña que auto-captura.
   */
  exportAsImage(playerId: string): void {
    const url = `/report/${playerId}?format=image`;
    const win = window.open(url, "_blank");
    if (!win) {
      window.location.href = url;
    }
  },

  /**
   * Imprime la página actual directamente.
   * Útil para dashboards y rankings.
   */
  printCurrentPage(): void {
    window.print();
  },
};
