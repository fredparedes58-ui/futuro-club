/**
 * PrecisionToggle — Tests
 *
 * Verifica: render del toggle, persistencia vía get/setTilingConfig (reutilizada,
 * no duplicada), copy HONESTO (aviso de lentitud + "re-analizar" + "no añade datos"),
 * y las tres afordancias del ciclo de vida (before / running / complete).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// t devuelve la clave → podemos asertar sobre las claves i18n en el DOM.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import PrecisionToggle from "@/components/vision/PrecisionToggle";
import { getTilingConfig, setTilingConfig } from "@/lib/yolo/tiling";
import es from "@/i18n/es.json";
import en from "@/i18n/en.json";

describe("PrecisionToggle", () => {
  beforeEach(() => {
    setTilingConfig(null); // tiling apagado por defecto (estado global real)
    vi.clearAllMocks();
  });

  it("renderiza el toggle con título, subtítulo y aviso de lentitud", () => {
    render(<PrecisionToggle />);
    expect(screen.getByText("precision.title")).toBeDefined();
    expect(screen.getByText("precision.subtitle")).toBeDefined();
    // El aviso "en vivo" (lentitud) es visible por defecto — nunca se promete directo fluido.
    expect(screen.getByText("precision.liveWarning")).toBeDefined();
  });

  it("arranca apagado cuando no hay tiling en localStorage", () => {
    render(<PrecisionToggle />);
    const toggle = screen.getByText("precision.title").closest("button")!;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("al activarlo persiste tiling 3×3 vía setTilingConfig y notifica onToggle(true)", () => {
    const onToggle = vi.fn();
    render(<PrecisionToggle onToggle={onToggle} />);
    const toggle = screen.getByText("precision.title").closest("button")!;

    fireEvent.click(toggle);

    // Reutiliza la persistencia existente (no duplica la malla): 3×3 = equipo completo.
    const cfg = getTilingConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.grid).toBe(3);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("al desactivarlo borra la config y notifica onToggle(false)", () => {
    setTilingConfig({ grid: 3, overlap: 0.15 }); // arranca encendido
    const onToggle = vi.fn();
    render(<PrecisionToggle onToggle={onToggle} />);
    const toggle = screen.getByText("precision.title").closest("button")!;
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle);

    expect(getTilingConfig()).toBeNull();
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("oculta el aviso de lentitud si showLiveWarning=false", () => {
    render(<PrecisionToggle showLiveWarning={false} />);
    expect(screen.queryByText("precision.liveWarning")).toBeNull();
  });

  it("phase=running muestra que cambiarlo reinicia la pasada", () => {
    render(<PrecisionToggle phase="running" />);
    expect(screen.getByText("precision.runningNote")).toBeDefined();
  });

  it("phase=complete sin precisión ofrece 'Re-analizar con precisión'", () => {
    const onReanalyze = vi.fn();
    render(
      <PrecisionToggle phase="complete" activePrecision={false} onReanalyze={onReanalyze} />,
    );
    const btn = screen.getByText("precision.reanalyze");
    expect(btn).toBeDefined();
    // Copy que deja claro que re-procesa, no añade al análisis anterior.
    expect(screen.getByText("precision.reanalyzeNote")).toBeDefined();

    fireEvent.click(btn);
    expect(onReanalyze).toHaveBeenCalledTimes(1);
  });

  it("phase=complete con precisión NO ofrece re-analizar (ya se hizo con tiling)", () => {
    const onReanalyze = vi.fn();
    render(
      <PrecisionToggle phase="complete" activePrecision={true} onReanalyze={onReanalyze} />,
    );
    expect(screen.queryByText("precision.reanalyze")).toBeNull();
    expect(screen.getByText("precision.alreadyPrecise")).toBeDefined();
  });

  // ── Copy honesto: se verifica sobre el JSON real (el render usa claves) ──
  describe("copy honesto (es.json / en.json)", () => {
    it("el subtítulo advierte que es más lento", () => {
      expect(es.precision.subtitle.toLowerCase()).toContain("lento");
      expect(en.precision.subtitle.toLowerCase()).toContain("slow");
    });

    it("el aviso de directo menciona fps y análisis en diferido, no promete directo fluido", () => {
      expect(es.precision.liveWarning.toLowerCase()).toContain("fps");
      expect(es.precision.liveWarning.toLowerCase()).toContain("diferido");
      expect(en.precision.liveWarning.toLowerCase()).toContain("fps");
      expect(en.precision.liveWarning.toLowerCase()).toContain("deferred");
    });

    it("re-analizar deja claro que re-procesa y NO añade al análisis anterior", () => {
      expect(es.precision.reanalyze).toContain("Re-analizar");
      expect(es.precision.reanalyzeNote.toLowerCase()).toContain("no añade");
      expect(en.precision.reanalyzeNote.toLowerCase()).toContain("does not add");
    });

    it("las claves de precision coinciden entre es y en (paridad)", () => {
      expect(Object.keys(es.precision).sort()).toEqual(Object.keys(en.precision).sort());
    });
  });
});
