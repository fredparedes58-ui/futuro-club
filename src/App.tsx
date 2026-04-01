import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";

// Pages — Auth
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";

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

// Sync hook — activa pull de Supabase al hacer login
function SyncManager() {
  useSupabaseSync();
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <SyncManager />
            <ErrorBoundary>
              <Routes>
                {/* ── Rutas públicas (auth) ─────────────────────────── */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />

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
                <Route path="/report/:id" element={<PlayerReportPrint />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
            <BottomNav />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
