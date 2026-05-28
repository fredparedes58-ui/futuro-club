import React, { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { SyncProvider } from "@/context/SyncContext";
import OfflineBanner from "@/components/OfflineBanner";
import CookieConsent from "@/components/CookieConsent";

// Pages — Auth (static — small, needed immediately)
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// Pages — Core (static — hit on every session)
import Index from "./pages/Index";
import PublicLanding from "./pages/PublicLanding";
import NotFound from "./pages/NotFound";
import BottomNav from "./components/BottomNav";
import GlobalSearch from "./components/GlobalSearch";
import ContextualFAB from "./components/ContextualFAB";
import OnboardingTour from "./components/OnboardingTour";
import FirstRunWizard from "./components/FirstRunWizard";
import AcceptTermsGate from "./components/AcceptTermsGate";

// Pages — Lazy loaded (heavy pages, loaded on demand)
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const ScoutFeed = React.lazy(() => import("./pages/ScoutFeed"));
const SoloDrill = React.lazy(() => import("./pages/SoloDrill"));
const Rankings = React.lazy(() => import("./pages/Rankings"));
const PlayerProfile = React.lazy(() => import("./pages/PlayerProfile"));
const PlayerHubPage = React.lazy(() => import("./pages/PlayerHubPage"));
const PlayerHubPrint = React.lazy(() => import("./pages/PlayerHubPrint"));
const PlayerComparison = React.lazy(() => import("./pages/PlayerComparison"));
const VitasLab = React.lazy(() => import("./pages/VitasLab"));
const MasterDashboard = React.lazy(() => import("./pages/MasterDashboard"));
const SettingsPage = React.lazy(() => import("./pages/SettingsPage"));
const RoleProfile = React.lazy(() => import("./pages/RoleProfile"));
const RoleProfileCompare = React.lazy(() => import("./pages/RoleProfileCompare"));
const RoleProfileAudit = React.lazy(() => import("./pages/RoleProfileAudit"));
const ReportsPage = React.lazy(() => import("./pages/ReportsPage"));
const PlayerForm = React.lazy(() => import("./pages/PlayerForm"));
const BillingPage = React.lazy(() => import("./pages/BillingPage"));
const OnboardingPage = React.lazy(() => import("./pages/OnboardingPage"));
const DirectorDashboard = React.lazy(() => import("./pages/DirectorDashboard"));
const PlayerIntelligencePage = React.lazy(() => import("./pages/PlayerIntelligencePage"));
const AdminDashboardPage = React.lazy(() => import("./pages/AdminDashboardPage"));
const AdminManagePlanPage = React.lazy(() => import("./pages/AdminManagePlanPage"));
const BiasAuditDashboard = React.lazy(() => import("./pages/BiasAuditDashboard"));
const ParentalConsentPage = React.lazy(() => import("./pages/ParentalConsentPage"));
const PricingPage = React.lazy(() => import("./pages/PricingPage"));
const PlayerReportPrint = React.lazy(() => import("./pages/PlayerReportPrint"));
const AnalysisReportPrint = React.lazy(() => import("./pages/AnalysisReportPrint"));
const TeamPage = React.lazy(() => import("./pages/TeamPage"));
const TeamAnalysisPage = React.lazy(() => import("./pages/TeamAnalysisPage"));
const TeamBaselinePage = React.lazy(() => import("./pages/TeamBaselinePage"));
const LiveHubPage = React.lazy(() => import("./pages/LiveHubPage"));
const LiveMatchPage = React.lazy(() => import("./pages/LiveMatchPage"));
const LiveSummaryPage = React.lazy(() => import("./pages/LiveSummaryPage"));
const CompareRivalPage = React.lazy(() => import("./pages/CompareRivalPage"));
const ParentDashboardPage = React.lazy(() => import("./pages/ParentDashboardPage"));
const CoachDashboardPage = React.lazy(() => import("./pages/CoachDashboardPage"));
const WellbeingDashboardPage = React.lazy(() => import("./pages/WellbeingDashboardPage"));
const AcceptInvitationPage = React.lazy(() => import("./pages/AcceptInvitationPage"));
const PlayerReportsPage = React.lazy(() => import("./pages/PlayerReportsPage"));
const PlayerEvolutionPage = React.lazy(() => import("./pages/PlayerEvolutionPage"));
const PlayerAnalysisPage = React.lazy(() => import("./pages/PlayerAnalysisPage"));
const SharedAnalysisPage = React.lazy(() => import("./pages/SharedAnalysisPage"));
const TermsPage = React.lazy(() => import("./pages/TermsPage"));
const PrivacyPage = React.lazy(() => import("./pages/PrivacyPage"));
const UserGuidePage = React.lazy(() => import("./pages/UserGuidePage"));

// Suspense fallback for lazy routes
const LazyFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Health check + purge — diagnóstico automático al iniciar
// (Sync is now handled by SyncProvider)
function SyncManager() {
  // Purge mock players + health check on mount (once)
  React.useEffect(() => {
    // Remove any fake/mock players from localStorage (legacy seed data)
    import("@/services/real/playerService").then(({ PlayerService }) => {
      PlayerService.purgeMockPlayers();
    });

    import("@/services/real/healthCheck").then(({ HealthCheckService }) => {
      const result = HealthCheckService.run();
      if (!result.healthy) {
        const errors = result.checks.filter(c => c.status === "error");
        console.error("[HealthCheck] Issues detected:", errors);
        // Import toast dynamically to avoid circular deps
        import("sonner").then(({ toast }) => {
          for (const err of errors) {
            toast.error(`${err.name}: ${err.message}`);
          }
        });
      }
      const warnings = result.checks.filter(c => c.status === "warning");
      if (warnings.length > 0) {
        console.warn("[HealthCheck] Warnings:", warnings);
      }
    });
  }, []);

  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Wrapper para rutas protegidas
const P = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>{children}</ProtectedRoute>
);

// Redirige rutas legacy (/intelligence, /role-profile) al hub con tab pre-seleccionado
const RedirectToHub = ({ tab }: { tab: string }) => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/players/${id}?tab=${tab}`} replace />;
};

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <SyncProvider>
            <SyncManager />
            <OfflineBanner />
            <CookieConsent />
            <AcceptTermsGate>
            <ErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
              <Routes>
                {/* ── Rutas públicas (auth) ─────────────────────────── */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/share/analysis/:analysisId" element={<SharedAnalysisPage />} />

                {/* ── Root redirect → login (no public landing) ────── */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/welcome" element={<Navigate to="/login" replace />} />

                {/* ── Rutas protegidas ──────────────────────────────── */}
                <Route path="/onboarding" element={<P><OnboardingPage /></P>} />
                <Route path="/home" element={<P><Index /></P>} />
                <Route path="/pulse" element={<P><Dashboard /></P>} />
                <Route path="/master" element={<P><MasterDashboard /></P>} />
                <Route path="/scout" element={<P><ScoutFeed /></P>} />
                <Route path="/drill" element={<P><SoloDrill /></P>} />
                <Route path="/rankings" element={<P><Rankings /></P>} />
                <Route path="/player/:id" element={<P><PlayerProfile /></P>} />
                <Route path="/compare" element={<P><PlayerComparison /></P>} />
                <Route path="/lab" element={<P><VitasLab /></P>} />
                <Route path="/settings" element={<P><SettingsPage /></P>} />
                <Route path="/billing" element={<P><BillingPage /></P>} />
                <Route path="/director" element={<P><DirectorDashboard /></P>} />
                <Route path="/admin" element={<P><AdminDashboardPage /></P>} />
                <Route path="/admin/plans" element={<P><AdminManagePlanPage /></P>} />
                <Route path="/admin/bias" element={<P><BiasAuditDashboard /></P>} />
                <Route path="/admin/consent" element={<P><ParentalConsentPage /></P>} />
                <Route path="/reports" element={<P><ReportsPage /></P>} />
                <Route path="/players/new" element={<P><PlayerForm /></P>} />
                {/* Hub consolidado · /players/:id?tab=resumen|stats|movimiento|rol|historico */}
                <Route path="/players/:id" element={<P><PlayerHubPage /></P>} />
                <Route path="/players/:id/edit" element={<P><PlayerForm /></P>} />
                {/* Legacy compat · ahora redirigen al hub con tab pre-seleccionado */}
                <Route path="/players/:id/intelligence" element={<P><RedirectToHub tab="stats" /></P>} />
                <Route path="/players/:id/role-profile" element={<P><RedirectToHub tab="rol" /></P>} />
                <Route path="/players/:id/role-profile/compare" element={<P><RoleProfileCompare /></P>} />
                <Route path="/players/:id/role-profile/audit" element={<P><RoleProfileAudit /></P>} />
                {/* Vista clásica disponible vía /players/:id/classic si alguien la quiere */}
                <Route path="/players/:id/classic" element={<P><PlayerProfile /></P>} />
                {/* Print-ready · 2 páginas A4 · descargable como PDF */}
                <Route path="/players/:id/print" element={<P><PlayerHubPrint /></P>} />
                <Route path="/players/:id/reports" element={<P><PlayerReportsPage /></P>} />
                <Route path="/players/:id/evolution" element={<P><PlayerEvolutionPage /></P>} />
                <Route path="/player/:id/analysis/:analysisId" element={<P><PlayerAnalysisPage /></P>} />
                {/* Alias: /player/:id/intelligence → misma página (backward compat) */}
                <Route path="/player/:id/intelligence" element={<P><PlayerIntelligencePage /></P>} />
                <Route path="/report/:id" element={<P><PlayerReportPrint /></P>} />
                <Route path="/analysis-report/:id" element={<AnalysisReportPrint />} />
                <Route path="/equipo" element={<P><TeamPage /></P>} />
                <Route path="/team-analysis" element={<P><TeamAnalysisPage /></P>} />
                <Route path="/equipo/baseline" element={<P><TeamBaselinePage /></P>} />
                <Route path="/live" element={<P><LiveHubPage /></P>} />
                <Route path="/live/:matchId" element={<P><LiveMatchPage /></P>} />
                <Route path="/live/:matchId/summary" element={<P><LiveSummaryPage /></P>} />
                <Route path="/equipo/rival" element={<P><CompareRivalPage /></P>} />
                <Route path="/coach" element={<P><CoachDashboardPage /></P>} />
                <Route path="/wellbeing" element={<P><WellbeingDashboardPage /></P>} />
                <Route path="/family/:playerId" element={<P><ParentDashboardPage /></P>} />
                <Route path="/aceptar-invitacion" element={<AcceptInvitationPage />} />
                <Route path="/guide" element={<P><UserGuidePage /></P>} />

                {/* Redirects for common broken URLs */}
              <Route path="/dashboard" element={<Navigate to="/pulse" replace />} />
              <Route path="/videos" element={<Navigate to="/reports" replace />} />
              <Route path="/players" element={<Navigate to="/rankings" replace />} />
              <Route path="/teams" element={<Navigate to="/equipo" replace />} />
              <Route path="/scouting" element={<Navigate to="/scout" replace />} />
              <Route path="/solo-drill" element={<Navigate to="/drill" replace />} />

              <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </ErrorBoundary>
            </AcceptTermsGate>
            <BottomNav />
            <GlobalSearch />
            <ContextualFAB />
            <OnboardingTour />
            <FirstRunWizard />
            </SyncProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
