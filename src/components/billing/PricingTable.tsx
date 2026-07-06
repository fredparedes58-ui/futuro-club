/**
 * VITAS · Pricing Table
 *
 * 4 planes para 5 personas:
 *   - Personal: padres, jugadores, entrenadores individuales
 *   - Pro: scouts, entrenadores con varios jugadores
 *   - Academia: academias, clubes base, equipos formativos, directivos
 *   - Agencia: agencias representación, agentes
 *
 * Uso:
 *   <PricingTable userPersona="parent" />
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Plan {
  tier: "personal" | "pro" | "academia" | "agencia";
  name: string;
  emoji: string;
  monthlyPrice: number;
  annualPrice: number;
  videos: string;
  forWho: string[];
  features: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    tier: "personal",
    name: "Personal",
    emoji: "👤",
    monthlyPrice: 4.99,
    annualPrice: 60,
    videos: "5 vídeos/mes",
    forWho: ["Padres", "Jugadores", "Entrenadores con 1-2 jugadores"],
    features: [
      "Hasta 2 jugadores",
      "5 vídeos al mes",
      "6 reportes por análisis",
      "VSI Score + PHV",
      "Histórico evolución",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    emoji: "👁️",
    monthlyPrice: 29,
    annualPrice: 350,
    videos: "50 vídeos/mes",
    forWho: ["Scouts freelance", "Entrenadores independientes", "Agentes individuales"],
    features: [
      "Hasta 50 jugadores",
      "50 vídeos al mes",
      "Comparativas multi-jugador",
      "Exportar PDFs",
      "Best-Match con base pro",
    ],
    highlight: true,
  },
  {
    tier: "academia",
    name: "Academia",
    emoji: "🎓",
    monthlyPrice: 99,
    annualPrice: 1200,
    videos: "250 vídeos/mes",
    forWho: ["Academias", "Clubes base", "Coaches de equipo", "Directivos deportivos"],
    features: [
      "Hasta 300 jugadores",
      "250 vídeos al mes",
      "Multi-rol (coach + director + scout)",
      "Dashboard de cantera",
      "VITAS.LAB completo",
    ],
  },
  {
    tier: "agencia",
    name: "Agencia",
    emoji: "🤝",
    monthlyPrice: 99,
    annualPrice: 1200,
    videos: "250 vídeos/mes",
    forWho: ["Agencias de representación", "Agentes profesionales"],
    features: [
      "Hasta 300 jugadores",
      "250 vídeos al mes",
      "Reportes white-label",
      "Multi-cliente",
      "Exportación a clubes",
    ],
  },
];

interface Props {
  userPersona?:
    | "parent"
    | "player"
    | "coach"
    | "scout"
    | "academy_director"
    | "agent"
    | "club_director"
    | "other";
  onSubscribed?: (tier: string) => void;
}

export function PricingTable({ userPersona, onSubscribed }: Props) {
  const { t } = useTranslation();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [persona, setPersona] = useState<Props["userPersona"]>(userPersona ?? "other");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(tier: string) {
    setLoadingTier(tier);
    setError(null);

    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          planTier: tier,
          userPersona: persona ?? "other",
          billingPeriod: billing,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message ?? t("pricingTable.errorCreatingCheckout"));
      }

      onSubscribed?.(tier);
      window.location.href = data.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pricingTable.errorUnknown"));
      setLoadingTier(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="text-center space-y-2">
        <h2 className="font-rajdhani font-bold text-3xl sm:text-4xl">
          {t("pricingTable.heading")}
        </h2>
        <p className="text-slate-600">
          {t("pricingTable.subheading")}
        </p>
      </header>

      {/* Selector de persona (opcional) */}
      <div className="flex flex-wrap justify-center gap-2">
        {[
          { id: "parent", label: t("pricingTable.personaParent") },
          { id: "player", label: t("pricingTable.personaPlayer") },
          { id: "coach", label: t("pricingTable.personaCoach") },
          { id: "scout", label: t("pricingTable.personaScout") },
          { id: "academy_director", label: t("pricingTable.personaAcademyDirector") },
          { id: "agent", label: t("pricingTable.personaAgent") },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setPersona(p.id as typeof persona)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              persona === p.id
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white border-slate-200 hover:border-slate-400"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Toggle mensual/anual */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-100 rounded-full p-1">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              billing === "monthly" ? "bg-white shadow" : "text-slate-600"
            }`}
          >
            {t("pricingTable.billingMonthly")}
          </button>
          <button
            onClick={() => setBilling("annual")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              billing === "annual" ? "bg-white shadow" : "text-slate-600"
            }`}
          >
            {t("pricingTable.billingAnnual")} <span className="ml-1 text-xs text-green-600 font-bold">-20%</span>
          </button>
        </div>
      </div>

      {/* Grid de planes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const price = billing === "monthly" ? plan.monthlyPrice : plan.annualPrice;
          const isLoading = loadingTier === plan.tier;
          return (
            <div
              key={plan.tier}
              className={`relative rounded-2xl p-6 border-2 transition ${
                plan.highlight
                  ? "border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50 shadow-lg"
                  : "border-slate-200 bg-white"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {t("pricingTable.badgePopular")}
                  </span>
                </div>
              )}
              <div className="text-3xl mb-2">{plan.emoji}</div>
              <h3 className="font-rajdhani font-bold text-xl mb-1">{plan.name}</h3>
              <div className="mb-3">
                <span className="text-3xl font-rajdhani font-bold">
                  €{billing === "monthly" ? price.toFixed(2) : Math.round(price)}
                </span>
                <span className="text-sm text-slate-600">
                  /{billing === "monthly" ? t("pricingTable.perMonth") : t("pricingTable.perYear")}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">{plan.videos}</p>

              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-700 mb-1.5">{t("pricingTable.forLabel")}</p>
                <ul className="text-xs text-slate-600 space-y-0.5">
                  {plan.forWho.map((w) => (
                    <li key={w}>· {w}</li>
                  ))}
                </ul>
              </div>

              <ul className="text-xs text-slate-700 space-y-1.5 mb-5 min-h-[120px]">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-green-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.tier)}
                disabled={isLoading}
                className={`w-full py-2.5 rounded-full text-sm font-semibold transition ${
                  plan.highlight
                    ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                } disabled:opacity-50`}
              >
                {isLoading ? t("pricingTable.loading") : t("pricingTable.subscribe")}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 max-w-md mx-auto">
          {error}
        </div>
      )}

      <p className="text-xs text-center text-slate-500 max-w-2xl mx-auto">
        {t("pricingTable.footerNote")}
      </p>
    </div>
  );
}
