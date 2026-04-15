/**
 * MatchStatsPanel — Tests
 * Verifica renderizado con diferentes combinaciones de datos.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchStatsPanel from "@/components/MatchStatsPanel";
import type { VideoIntelligenceOutput } from "@/agents/contracts";

// Mock framer-motion para evitar animaciones en tests
vi.mock("framer-motion", () => {
  const motion = new Proxy({}, {
    get: (_t, prop: string) => {
      return ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
        const Tag = prop as keyof JSX.IntrinsicElements;
        return <Tag {...(props as Record<string, unknown>)}>{children}</Tag>;
      };
    },
  });
  return { motion, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

type MC = NonNullable<VideoIntelligenceOutput["metricasCuantitativas"]>;

const eventosData: MC = {
  eventos: {
    pasesCompletados: 40,
    pasesFallados: 10,
    precisionPases: 80,
    recuperaciones: 5,
    duelosGanados: 6,
    duelosPerdidos: 4,
    disparosAlArco: 3,
    disparosFuera: 2,
  },
  fuente: "gemini_only",
  confianza: 0.7,
};

const fisicasData: MC = {
  fisicas: {
    velocidadMaxKmh: 28.5,
    velocidadPromKmh: 9.2,
    distanciaM: 4250,
    sprints: 12,
    zonasIntensidad: { caminar: 1800, trotar: 1200, correr: 950, sprint: 300 },
  },
  fuente: "yolo_only",
  confianza: 0.6,
};

const fullData: MC = {
  ...eventosData,
  ...fisicasData,
  fuente: "yolo+gemini",
  confianza: 0.85,
};

describe("MatchStatsPanel", () => {
  describe("con solo eventos", () => {
    it("renderiza título principal", () => {
      render(<MatchStatsPanel data={eventosData} />);
      expect(screen.getByText(/panel de estadísticas/i)).toBeInTheDocument();
    });

    it("muestra rating compuesto", () => {
      render(<MatchStatsPanel data={eventosData} />);
      // Rating tendrá un número entre 0 y 10 con un decimal
      const ratings = screen.getAllByText(/^\d+\.\d$/);
      expect(ratings.length).toBeGreaterThan(0);
    });

    it("muestra KPI Pases con precisión", () => {
      render(<MatchStatsPanel data={eventosData} />);
      expect(screen.getByText(/pases/i)).toBeInTheDocument();
      expect(screen.getByText("80%")).toBeInTheDocument();
    });

    it("muestra KPI Duelos con efectividad", () => {
      render(<MatchStatsPanel data={eventosData} />);
      expect(screen.getByText(/duelos/i)).toBeInTheDocument();
      expect(screen.getByText("60%")).toBeInTheDocument();
    });

    it("muestra recuperaciones", () => {
      render(<MatchStatsPanel data={eventosData} />);
      expect(screen.getByText(/recuperaciones/i)).toBeInTheDocument();
      expect(screen.getByText(/balones recuperados/i)).toBeInTheDocument();
    });

    it("muestra disparos con sub-label al arco/fuera", () => {
      render(<MatchStatsPanel data={eventosData} />);
      expect(screen.getByText(/disparos/i)).toBeInTheDocument();
      expect(screen.getByText(/3 al arco · 2 fuera/i)).toBeInTheDocument();
    });

    it("no muestra sección físicas", () => {
      render(<MatchStatsPanel data={eventosData} />);
      expect(screen.queryByText(/rendimiento físico/i)).not.toBeInTheDocument();
    });

    it("muestra totales agregados", () => {
      render(<MatchStatsPanel data={eventosData} />);
      expect(screen.getByText(/ofensivas/i)).toBeInTheDocument();
      expect(screen.getByText(/defensivas/i)).toBeInTheDocument();
    });

    it("muestra fuente correcta", () => {
      render(<MatchStatsPanel data={eventosData} />);
      expect(screen.getByText(/observación ia/i)).toBeInTheDocument();
    });
  });

  describe("con solo físicas", () => {
    it("muestra sección rendimiento físico", () => {
      render(<MatchStatsPanel data={fisicasData} />);
      expect(screen.getByText(/rendimiento físico/i)).toBeInTheDocument();
    });

    it("muestra velocidad máxima", () => {
      render(<MatchStatsPanel data={fisicasData} />);
      expect(screen.getByText(/vel\. máx/i)).toBeInTheDocument();
      expect(screen.getByText("28.5")).toBeInTheDocument();
    });

    it("muestra zonas de intensidad", () => {
      render(<MatchStatsPanel data={fisicasData} />);
      expect(screen.getByText(/zonas de intensidad/i)).toBeInTheDocument();
    });

    it("no muestra KPIs de eventos", () => {
      render(<MatchStatsPanel data={fisicasData} />);
      // No debe haber card comparativa de pases (busca el "80%" que solo existe en eventos)
      expect(screen.queryByText("80%")).not.toBeInTheDocument();
    });

    it("muestra fuente correcta", () => {
      render(<MatchStatsPanel data={fisicasData} />);
      expect(screen.getByText(/tracking yolo/i)).toBeInTheDocument();
    });
  });

  describe("con ambas secciones (full)", () => {
    it("muestra eventos Y físicas", () => {
      render(<MatchStatsPanel data={fullData} />);
      expect(screen.getByText(/pases/i)).toBeInTheDocument();
      expect(screen.getByText(/rendimiento físico/i)).toBeInTheDocument();
    });

    it("fuente es Tracking + IA", () => {
      render(<MatchStatsPanel data={fullData} />);
      expect(screen.getByText(/tracking \+ ia/i)).toBeInTheDocument();
    });
  });

  describe("título custom", () => {
    it("acepta prop title", () => {
      render(<MatchStatsPanel data={eventosData} title="Mi Partido" />);
      expect(screen.getByText(/mi partido/i)).toBeInTheDocument();
    });
  });

  describe("sin datos válidos", () => {
    it("no renderiza nada si metricas es null/undefined via computeMatchStats", () => {
      // @ts-expect-error — testing null case
      const { container } = render(<MatchStatsPanel data={null} />);
      expect(container.firstChild).toBeNull();
    });
  });
});
