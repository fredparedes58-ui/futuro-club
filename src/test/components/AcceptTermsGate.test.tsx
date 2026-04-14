/**
 * AcceptTermsGate — Tests
 * Verifica que bloquea cuando needsAcceptance y deja pasar cuando no.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLegal = vi.fn();
vi.mock("@/hooks/useLegalAcceptance", () => ({
  useLegalAcceptance: () => mockLegal(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback ?? _key,
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

import AcceptTermsGate from "@/components/AcceptTermsGate";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AcceptTermsGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when no acceptance needed", () => {
    mockLegal.mockReturnValue({
      needsAcceptance: false,
      isLoading: false,
      termsAccepted: true,
      privacyAccepted: true,
      acceptAll: vi.fn(),
      isAccepting: false,
    });
    render(
      <AcceptTermsGate>
        <div data-testid="app-content">App Content</div>
      </AcceptTermsGate>
    );
    expect(screen.getByTestId("app-content")).toBeDefined();
  });

  it("renders children while loading (graceful degradation)", () => {
    mockLegal.mockReturnValue({
      needsAcceptance: false,
      isLoading: true,
      acceptAll: vi.fn(),
      isAccepting: false,
    });
    render(
      <AcceptTermsGate>
        <div data-testid="app-content">App Content</div>
      </AcceptTermsGate>
    );
    expect(screen.getByTestId("app-content")).toBeDefined();
  });

  it("shows acceptance modal when terms need acceptance", () => {
    mockLegal.mockReturnValue({
      needsAcceptance: true,
      isLoading: false,
      termsAccepted: false,
      privacyAccepted: false,
      currentVersions: { terms: "2026-04-12", privacy: "2026-04-12" },
      acceptAll: vi.fn(),
      isAccepting: false,
    });
    render(
      <AcceptTermsGate>
        <div data-testid="app-content">App Content</div>
      </AcceptTermsGate>
    );
    // Modal should be visible
    expect(screen.getByText("Aceptar condiciones")).toBeDefined();
    // Children should NOT be visible (behind modal)
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("accept button is disabled until both checkboxes are checked", () => {
    mockLegal.mockReturnValue({
      needsAcceptance: true,
      isLoading: false,
      termsAccepted: false,
      privacyAccepted: false,
      currentVersions: { terms: "2026-04-12", privacy: "2026-04-12" },
      acceptAll: vi.fn(),
      isAccepting: false,
    });
    render(
      <AcceptTermsGate>
        <div>App</div>
      </AcceptTermsGate>
    );

    const button = screen.getByText("Aceptar y continuar");
    expect(button.getAttribute("disabled")).not.toBeNull();

    // Check both checkboxes
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    // Now button should be enabled
    expect(button.getAttribute("disabled")).toBeNull();
  });

  it("calls acceptAll when button is clicked", async () => {
    const mockAcceptAll = vi.fn().mockResolvedValue(undefined);
    mockLegal.mockReturnValue({
      needsAcceptance: true,
      isLoading: false,
      termsAccepted: false,
      privacyAccepted: false,
      currentVersions: { terms: "2026-04-12", privacy: "2026-04-12" },
      acceptAll: mockAcceptAll,
      isAccepting: false,
    });
    render(
      <AcceptTermsGate>
        <div>App</div>
      </AcceptTermsGate>
    );

    // Check both
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    // Click accept
    fireEvent.click(screen.getByText("Aceptar y continuar"));
    expect(mockAcceptAll).toHaveBeenCalledTimes(1);
  });

  it("has links to terms and privacy pages", () => {
    mockLegal.mockReturnValue({
      needsAcceptance: true,
      isLoading: false,
      acceptAll: vi.fn(),
      isAccepting: false,
    });
    render(
      <AcceptTermsGate>
        <div>App</div>
      </AcceptTermsGate>
    );

    const links = document.querySelectorAll('a[target="_blank"]');
    const hrefs = Array.from(links).map(l => l.getAttribute("href"));
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/privacy");
  });
});
