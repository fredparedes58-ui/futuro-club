/**
 * VITAS · PlayerPhvSection — entrada UNIFICADA de datos PHV por jugador.
 *
 * Reúne en un solo sitio (la ficha del jugador) las DOS entradas que antes
 * estaban repartidas:
 *   1. Medidas antropométricas (altura/peso/altura sentado/pierna) → Mirwald.
 *   2. Datos parentales (alturas de madre+padre) + fecha nac. → Khamis-Roche
 *      (%talla adulta), la proyección fiable cuando la edad está lejos del PHV.
 *
 * Antes las alturas parentales solo vivían en "Editar jugador", así que el
 * mensaje de proyección ("añade la altura de ambos padres") era un callejón
 * sin salida. Ahora se editan aquí mismo.
 *
 * Usado por el Hub (pestaña Movimiento) y por el perfil clásico.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ruler, Users, Save, Loader2 } from "lucide-react";

import { AnthropometricsForm } from "@/components/player/AnthropometricsForm";
import GrowthVelocityChart from "@/components/player/GrowthVelocityChart";
import { PhvWindowPlan } from "@/components/player/PhvWindowPlan";
import { PlayerService, type Player } from "@/services/real/playerService";
import { SupabasePlayerService } from "@/services/real/supabasePlayerService";
import { useAuth } from "@/context/AuthContext";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";

interface Props {
  player: Player;
  hasPhv: boolean;
  /** Se llama tras guardar datos parentales — el host refresca su copia del jugador. */
  onSaved?: () => void;
}

// Rangos plausibles (idénticos al schema de playerService).
const MOTHER_RANGE = [120, 210] as const;
const FATHER_RANGE = [120, 230] as const;

export default function PlayerPhvSection({ player, hasPhv, onSaved }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [birthDate, setBirthDate] = useState(player.birthDate ?? "");
  const [motherH, setMotherH] = useState(player.motherHeightCm?.toString() ?? "");
  const [fatherH, setFatherH] = useState(player.fatherHeightCm?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  function outOfRange(v: string, [min, max]: readonly [number, number]): boolean {
    if (!v) return false;
    const n = Number(v);
    return Number.isNaN(n) || n < min || n > max;
  }

  async function saveParental() {
    if (outOfRange(motherH, MOTHER_RANGE) || outOfRange(fatherH, FATHER_RANGE)) {
      toast.error(t("playerPhvSection.parentalRangeError"));
      return;
    }
    setSaving(true);
    try {
      const updated = await PlayerService.update(player.id, {
        birthDate: birthDate || undefined,
        motherHeightCm: motherH ? Number(motherH) : undefined,
        fatherHeightCm: fatherH ? Number(fatherH) : undefined,
      });
      if (updated && user && SUPABASE_CONFIGURED) {
        SupabasePlayerService.pushOne(user.id, updated).catch(() => {});
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["player", player.id] }),
        queryClient.invalidateQueries({ queryKey: ["player-raw", player.id] }),
        queryClient.invalidateQueries({ queryKey: ["players-all"] }),
      ]);
      toast.success(t("playerPhvSection.parentalSaved"));
      onSaved?.();
    } catch {
      toast.error(t("playerPhvSection.parentalError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Ruler size={14} className="text-primary" />
        <h2 className="font-display font-semibold text-sm text-foreground">
          {t("playerProfile.anthropometrics")}
        </h2>
        <span className="text-[10px] text-muted-foreground ml-auto">PHV · Mirwald</span>
      </div>

      {/* 1 · Medidas antropométricas → Mirwald */}
      <AnthropometricsForm
        playerId={player.id}
        chronologicalAge={player.age}
        gender={player.gender ?? "M"}
        fallback={{
          heightCm: player.height,
          weightKg: player.weight,
          sittingHeightCm: player.sittingHeight,
          legLengthCm: player.legLength,
        }}
      />

      {/* 2 · Datos parentales → Khamis-Roche (%talla adulta) */}
      <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
        <div className="flex items-center gap-2">
          <Users size={13} className="text-primary" />
          <h3 className="text-xs font-display font-semibold text-foreground">
            {t("playerPhvSection.parentalTitle")}
          </h3>
          <span className="text-[10px] text-muted-foreground ml-auto">Khamis-Roche</span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {t("playerPhvSection.parentalNote")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[10px] text-muted-foreground space-y-1">
            <span>{t("playerPhvSection.birthDate")}</span>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-md bg-secondary/40 border border-border px-2 py-1.5 text-xs text-foreground"
            />
          </label>
          <label className="text-[10px] text-muted-foreground space-y-1">
            <span>{t("playerPhvSection.motherHeight")}</span>
            <input
              type="number"
              inputMode="numeric"
              value={motherH}
              onChange={(e) => setMotherH(e.target.value)}
              placeholder="165"
              className="w-full rounded-md bg-secondary/40 border border-border px-2 py-1.5 text-xs text-foreground"
            />
          </label>
          <label className="text-[10px] text-muted-foreground space-y-1">
            <span>{t("playerPhvSection.fatherHeight")}</span>
            <input
              type="number"
              inputMode="numeric"
              value={fatherH}
              onChange={(e) => setFatherH(e.target.value)}
              placeholder="178"
              className="w-full rounded-md bg-secondary/40 border border-border px-2 py-1.5 text-xs text-foreground"
            />
          </label>
        </div>
        <button
          onClick={saveParental}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {t("playerPhvSection.parentalSave")}
        </button>
      </div>

      {/* 3 · Curva de velocidad de crecimiento + plan de ventana PHV */}
      <div className="mt-4 pt-4 border-t border-border/40">
        <GrowthVelocityChart playerId={player.id} />
      </div>
      <div className="mt-4 pt-4 border-t border-border/40">
        <PhvWindowPlan playerId={player.id} hasPhv={hasPhv} />
      </div>
    </div>
  );
}
