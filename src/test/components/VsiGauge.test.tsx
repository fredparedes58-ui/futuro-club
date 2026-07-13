/**
 * VITAS · Tests — VsiGauge Component
 * Verifica: renderizado, tamaños, colores, label
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// VsiGauge cuenta el número de 0 hasta `value` con framer-motion
// (useMotionValue/useTransform/animate + displayed.on("change", setN)).
// En jsdom la animación no avanza, así que el contador se quedaba en 0 y las
// aserciones del valor final (75, 100) fallaban. Igual que el resto de tests
// del repo, mockeamos framer-motion para renderizar el ESTADO FINAL de forma
// síncrona: motion.* → tags planos y animate() salta directo al valor objetivo.
vi.mock("framer-motion", () => {
  const motion = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        return ({ children, ...props }: any) => {
          const Tag = prop as any;
          return <Tag {...props}>{children}</Tag>;
        };
      },
    },
  );

  // MotionValue mínimo: valor actual + listeners de cambio.
  // `on` emite el valor actual al suscribirse, de modo que setN recibe el valor
  // final aunque el listener se registre después de animate().
  const makeMV = (initial: number) => {
    let current = initial;
    const listeners = new Set<(v: number) => void>();
    return {
      get: () => current,
      set: (v: number) => {
        current = v;
        listeners.forEach((fn) => fn(v));
      },
      on: (_event: string, fn: (v: number) => void) => {
        listeners.add(fn);
        fn(current);
        return () => listeners.delete(fn);
      },
    };
  };

  const useMotionValue = (initial: number) => makeMV(initial);

  const useTransform = (source: any, transform: (v: number) => number) => {
    const derived = makeMV(transform(source.get()));
    source.on("change", (v: number) => derived.set(transform(v)));
    return derived;
  };

  // Sin animación en tests: salta directo al valor objetivo.
  const animate = (mv: any, target: number) => {
    mv.set(target);
    return { stop: () => {} };
  };

  return {
    motion,
    AnimatePresence: ({ children }: any) => <>{children}</>,
    useMotionValue,
    useTransform,
    animate,
  };
});

import VsiGauge from "@/components/VsiGauge";

describe("VsiGauge", () => {
  it("renderiza el valor numérico", () => {
    render(<VsiGauge value={75} />);
    expect(screen.getByText("75")).toBeDefined();
  });

  it("renderiza label VSI por defecto en size md", () => {
    render(<VsiGauge value={60} size="md" />);
    expect(screen.getByText("VSI")).toBeDefined();
  });

  it("size sm NO muestra label", () => {
    render(<VsiGauge value={60} size="sm" />);
    expect(screen.queryByText("VSI")).toBeNull();
  });

  it("size lg muestra label", () => {
    render(<VsiGauge value={80} size="lg" />);
    expect(screen.getByText("VSI")).toBeDefined();
  });

  it("label personalizado se muestra", () => {
    render(<VsiGauge value={70} size="md" label="PHV" />);
    expect(screen.getByText("PHV")).toBeDefined();
  });

  it("renderiza SVG con circle elements", () => {
    const { container } = render(<VsiGauge value={50} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();

    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2); // background + animated
  });

  it("value 0 se muestra correctamente", () => {
    render(<VsiGauge value={0} />);
    expect(screen.getByText("0")).toBeDefined();
  });

  it("value 100 se muestra correctamente", () => {
    render(<VsiGauge value={100} />);
    expect(screen.getByText("100")).toBeDefined();
  });
});
