import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/master" element={<MasterDashboard />} />
          <Route path="/scout" element={<ScoutFeed />} />
          <Route path="/drill" element={<SoloDrill />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/player/:id" element={<PlayerProfile />} />
          <Route path="/compare" element={<PlayerComparison />} />
          <Route path="/lab" element={<VitasLab />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/checkout" element={<OrderConfirmation />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <BottomNav />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
