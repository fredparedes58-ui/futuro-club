/**
 * VITAS · VitasLabTeam Page (Sprint 8)
 *
 * Team/Rival analysis page that re-exports VitasLab in team mode.
 * This is a thin wrapper — the real logic lives in VitasLab with
 * the mode toggle (Jugador/Equipo/Rival Scout).
 *
 * Route: /lab/team
 */

import React from "react";
import { useNavigate } from "react-router-dom";

const VitasLabTeam: React.FC = () => {
  const navigate = useNavigate();

  // Redirect to VitasLab with team mode query param
  React.useEffect(() => {
    navigate("/lab?mode=team", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="glass rounded-xl p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <span className="text-primary text-xl">⚽</span>
        </div>
        <p className="text-sm font-display font-bold text-foreground">
          Redirigiendo a VITAS.LAB modo equipo...
        </p>
        <p className="text-xs text-muted-foreground">
          Análisis táctico completo · Formaciones · Red de pases · Scouting rival
        </p>
      </div>
    </div>
  );
};

export default VitasLabTeam;
