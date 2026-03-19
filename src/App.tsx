import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import Index from "./pages/Index";
import ScoutFeed from "./pages/ScoutFeed";
import SoloDrill from "./pages/SoloDrill";
import Rankings from "./pages/Rankings";
import PlayerProfile from "./pages/PlayerProfile";
import PlayerComparison from "./pages/PlayerComparison";
import VitasLab from "./pages/VitasLab";
import MasterDashboard from "./pages/MasterDashboard";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import OrderConfirmation from "./pages/OrderConfirmation";
import BottomNav from "./components/BottomNav";
import RoleProfile from "./pages/RoleProfile";
import RoleProfileCompare from "./pages/RoleProfileCompare";
import RoleProfileAudit from "./pages/RoleProfileAudit";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/pulse" element={<Dashboard />} />
              <Route path="/master" element={<MasterDashboard />} />
              <Route path="/scout" element={<ScoutFeed />} />
              <Route path="/drill" element={<SoloDrill />} />
              <Route path="/rankings" element={<Rankings />} />
              <Route path="/player/:id" element={<PlayerProfile />} />
              <Route path="/compare" element={<PlayerComparison />} />
              <Route path="/lab" element={<VitasLab />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/checkout" element={<OrderConfirmation />} />
              <Route path="/players/:id/role-profile" element={<RoleProfile />} />
              <Route path="/players/:id/role-profile/compare" element={<RoleProfileCompare />} />
              <Route path="/players/:id/role-profile/audit" element={<RoleProfileAudit />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
          <BottomNav />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
