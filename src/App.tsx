import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import OfflineBanner from "@/components/OfflineBanner";
import CookieConsent from "@/components/CookieConsent";

// Pages — Auth
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// Pages — App
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import ScoutFeed from "./pages/ScoutFeed";
import SoloDrill from "./pages/SoloDrill";
import Rankings from "./pages/Rankings";
import PlayerProfile from "./pages/PlayerProfile";
import PlayerComparison from "./pages/PlayerComparison";
import VitasLab from "./pages/VitasLab";
import MasterDashboard from "./pages/MasterDashboard";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import BottomNav from "./components/BottomNav";
import RoleProfile from "./pages/RoleProfile";
import RoleProfileCompare from "./pages/RoleProfileCompare";
import RoleProfileAudit from "./pages/RoleProfileAudit";
import ReportsPage from "./pages/ReportsPage";
import PlayerForm from "./pages/PlayerForm";
import BillingPage from "./pages/BillingPage";
import OnboardingPage from "./pages/OnboardingPage";
import DirectorDashboard from "./pages/DirectorDashboard";
import PlayerIntelligencePage from "./pages/PlayerIntelligencePage";
import PlayerReportPrint from "./pages/PlayerReportPrint";
import AnalysisReportPrint from "./pages/AnalysisReportPrint";
import TeamPage from "./pages/TeamPage";
import TeamAnalysisPage from "./pages/TeamAnalysisPage";
import AcceptInvitationPage from "./pages/AcceptInvitationPage";
import PlayerReportsPage from "./pages/PlayerReportsPage";
import PlayerEvolutionPage from "./pages/PlayerEvolutionPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";

// Sync hook — activa pull de Supabase al hacer login
// Health check — diagnóstico automático al iniciar
function SyncManager() {
  useSupabaseSync();

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

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <SyncManager />
            <OfflineBanner />
            <CookieConsent />
            <ErrorBoundary>
              <Routes>
                {/* ── Rutas públicas (auth) ─────────────────────────── */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />

                {/* ── Rutas protegidas ──────────────────────────────── */}
                <Route path="/onboarding" element={<P><OnboardingPage /></P>} />
                <Route path="/" element={<P><Index /></P>} />
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
                <Route path="/reports" element={<P><ReportsPage /></P>} />
                <Route path="/players/new" element={<P><PlayerForm /></P>} />
                <Route path="/players/:id/edit" element={<P><PlayerForm /></P>} />
                <Route path="/players/:id/role-profile" element={<P><RoleProfile /></P>} />
                <Route path="/players/:id/role-profile/compare" element={<P><RoleProfileCompare /></P>} />
                <Route path="/players/:id/role-profile/audit" element={<P><RoleProfileAudit /></P>} />
                <Route path="/players/:id/intelligence" element={<P><PlayerIntelligencePage /></P>} />
                <Route path="/players/:id/reports" element={<P><PlayerReportsPage /></P>} />
                <Route path="/players/:id/evolution" element={<P><PlayerEvolutionPage /></P>} />
                {/* Alias: /player/:id/intelligence → misma página (backward compat) */}
                <Route path="/player/:id/intelligence" element={<P><PlayerIntelligencePage /></P>} />
                <Route path="/report/:id" element={<P><PlayerReportPrint /></P>} />
                <Route path="/analysis-report/:id" element={<AnalysisReportPrint />} />
                <Route path="/equipo" element={<P><TeamPage /></P>} />
                <Route path="/team-analysis" element={<P><TeamAnalysisPage /></P>} />
                <Route path="/aceptar-invitacion" element={<AcceptInvitationPage />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
            <BottomNav />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
