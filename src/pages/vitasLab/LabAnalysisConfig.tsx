import { type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Users, ScanSearch, Swords, UserRound } from "lucide-react";
import AnalysisFocusSelector from "@/components/AnalysisFocusSelector";
import type { useTracking } from "@/hooks/useTracking";

const analysisModes = [
  { id: "all",    labelKey: "vitasLab.modeAllPlayers",      descKey: "vitasLab.modeAllPlayersDesc",      icon: Users },
  { id: "click",  labelKey: "vitasLab.modeManualTracking",  descKey: "vitasLab.modeManualTrackingDesc",  icon: ScanSearch },
  { id: "team",   labelKey: "vitasLab.modeFullTeam",        descKey: "vitasLab.modeFullTeamDesc",        icon: Swords },
  { id: "player", labelKey: "vitasLab.modeSpecificPlayer",  descKey: "vitasLab.modeSpecificPlayerDesc",  icon: UserRound },
];

interface LabAnalysisConfigProps {
  tracking: ReturnType<typeof useTracking>;
  selectedMode: string;
  setSelectedMode: Dispatch<SetStateAction<string>>;
  jerseyNumber: string;
  setJerseyNumber: Dispatch<SetStateAction<string>>;
  teamColor: string;
  setTeamColor: Dispatch<SetStateAction<string>>;
  homeTeamColor: string;
  setHomeTeamColor: Dispatch<SetStateAction<string>>;
  awayTeamColor: string;
  setAwayTeamColor: Dispatch<SetStateAction<string>>;
  playerName: string;
  setPlayerName: Dispatch<SetStateAction<string>>;
  playerPosition: string;
  setPlayerPosition: Dispatch<SetStateAction<string>>;
  homeFormation: string;
  setHomeFormation: Dispatch<SetStateAction<string>>;
  awayFormation: string;
  setAwayFormation: Dispatch<SetStateAction<string>>;
  playedPosition: string;
  setPlayedPosition: Dispatch<SetStateAction<string>>;
  analysisFocus: string[];
  setAnalysisFocus: Dispatch<SetStateAction<string[]>>;
  isClub: boolean;
  setShowUpgradePrompt: Dispatch<SetStateAction<boolean>>;
  selectedPlayerId: string | null;
  players: Array<{ id: string; position: string; secondaryPositions?: string[] }>;
}

/** Panel de configuración del análisis en la sidebar (advanced settings de VitasLabOneClick):
 *  identidad del jugador, coordenadas de campo, selector de modo + config por modo, posición
 *  jugada y enfoque. Presentacional; todo el estado del formulario vive en el padre. */
const LabAnalysisConfig = ({
  tracking,
  selectedMode,
  setSelectedMode,
  jerseyNumber,
  setJerseyNumber,
  teamColor,
  setTeamColor,
  homeTeamColor,
  setHomeTeamColor,
  awayTeamColor,
  setAwayTeamColor,
  playerName,
  setPlayerName,
  playerPosition,
  setPlayerPosition,
  homeFormation,
  setHomeFormation,
  awayFormation,
  setAwayFormation,
  playedPosition,
  setPlayedPosition,
  analysisFocus,
  setAnalysisFocus,
  isClub,
  setShowUpgradePrompt,
  selectedPlayerId,
  players,
}: LabAnalysisConfigProps) => {
  const { t } = useTranslation();

  return (
    <>
          {/* Auto-detected player identity (Sprint 4 — Re-ID replaces manual dorsal input) */}
          {(selectedMode === "all" || selectedMode === "team") && (
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              {t("lab.identifyPlayer")}
            </span>
            {tracking.state.identities.size > 0 ? (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] font-display text-green-400 font-semibold">
                    {t("vitasLab.reIdActive", { count: tracking.state.identities.size })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[...tracking.state.identities.entries()].slice(0, 8).map(([trackId, identity]) => (
                    <span
                      key={trackId}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-display font-semibold ${
                        identity.team === "home" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                        identity.team === "away" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                        "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {identity.dorsalNumber ? `#${identity.dorsalNumber}` : identity.stableId.replace("pid_", "P")}
                      {identity.team !== "unknown" ? ` (${identity.team})` : ""}
                    </span>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground leading-tight">
                  {t("vitasLab.dorsalsAutoDetected")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("lab.jerseyNumber")}</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder={t("lab.jerseyPlaceholder")}
                    className="w-full mt-1 px-2 py-2 rounded-lg border border-border bg-secondary/50 text-sm font-display font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("lab.uniformColor")}</label>
                  <input
                    type="text"
                    value={teamColor}
                    onChange={(e) => setTeamColor(e.target.value)}
                    placeholder={t("lab.uniformPlaceholder")}
                    className="w-full mt-1 px-2 py-2 rounded-lg border border-border bg-secondary/50 text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            )}
            {tracking.state.identities.size === 0 && (
              <p className="mt-1.5 text-[9px] text-muted-foreground leading-tight">
                {t("lab.jerseyHint")} · {t("vitasLab.autoDetectOnTracking")}
              </p>
            )}
          </div>
          )}

          {/* Coordinate Realtime */}
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              {t("lab.coordinateRealtime")}
            </span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="glass rounded-lg p-3">
                <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">FIELD_X</span>
                <p className="font-display font-bold text-xl text-primary">105.00m</p>
              </div>
              <div className="glass rounded-lg p-3">
                <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">FIELD_Y</span>
                <p className="font-display font-bold text-xl text-primary">68.00m</p>
              </div>
            </div>
          </div>

          {/* Analysis Mode */}
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              {t("lab.analysisMode")}
            </span>
            <div className="flex flex-col gap-2 mt-3">
              {analysisModes.map((mode) => {
                const Icon   = mode.icon;
                const active = selectedMode === mode.id;
                const isTeamMode = mode.id === "team";
                const locked = isTeamMode && !isClub;
                return (
                  <button
                    key={mode.id}
                    onClick={() => {
                      if (locked) {
                        setShowUpgradePrompt(true);
                        return;
                      }
                      setSelectedMode(mode.id);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${locked ? "opacity-60 border-border" : active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-primary/10" : "bg-secondary"}`}>
                      <Icon size={15} className={active ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-display font-bold text-xs text-foreground">{t(mode.labelKey)}</h4>
                      <p className="text-[9px] text-muted-foreground leading-tight">{t(mode.descKey)}</p>
                    </div>
                    {locked && (
                      <span className="text-[8px] font-display font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">Club</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Panel de configuración según el modo seleccionado */}
            <div className="mt-3 space-y-2">

              {/* ALL PLAYERS — colores de equipos */}
              {selectedMode === "all" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{t("vitasLab.teamsConfig")}</p>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.homeTeamColor")}</label>
                    <input value={homeTeamColor} onChange={e => setHomeTeamColor(e.target.value)}
                      placeholder={t("vitasLab.homeColorPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.awayTeamColor")}</label>
                    <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                      placeholder={t("vitasLab.awayColorPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                </div>
              )}

              {/* CLICK-TO-TRACK — jugador específico manual */}
              {selectedMode === "click" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{t("vitasLab.playerToTrack")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.jerseyNumber")}</label>
                      <input value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)}
                        placeholder="10" maxLength={3} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display font-bold focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.uniformColor")}</label>
                      <input value={teamColor} onChange={e => setTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorRedPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.playerNameOptional")}</label>
                    <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                      placeholder={t("vitasLab.playerNamePlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.fieldPosition")}</label>
                    <select value={playerPosition} onChange={e => setPlayerPosition(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                      <option value="">{t("vitasLab.selectOption")}</option>
                      {["POR","LI","LD","CB","MCD","MC","MCO","EI","ED","DC","SD"].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{t("vitasLab.autoTrackHint")}</p>
                </div>
              )}

              {/* FULL TEAM — formaciones de ambos equipos */}
              {selectedMode === "team" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{t("vitasLab.tacticalContext")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.homeFormation")}</label>
                      <select value={homeFormation} onChange={e => setHomeFormation(e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                        {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2","4-1-4-1","3-4-3"].map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.awayFormation")}</label>
                      <select value={awayFormation} onChange={e => setAwayFormation(e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                        {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2","4-1-4-1","3-4-3"].map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.homeColor")}</label>
                      <input value={homeTeamColor} onChange={e => setHomeTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorWhitePlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.awayColor")}</label>
                      <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorRedPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{t("vitasLab.fullTeamHint")}</p>
                </div>
              )}

              {/* SPECIFIC PLAYER — jugador identificado por dorsal */}
              {selectedMode === "player" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{t("vitasLab.playerProfile")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.jerseyNumberRequired")}</label>
                      <input value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)}
                        placeholder="10" maxLength={3} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display font-bold focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.uniformColorRequired")}</label>
                      <input value={teamColor} onChange={e => setTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorMaroonPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.name")}</label>
                    <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                      placeholder={t("vitasLab.playerNameFieldPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.position")}</label>
                    <select value={playerPosition} onChange={e => setPlayerPosition(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                      <option value="">{t("vitasLab.selectOption")}</option>
                      {["POR","LI","LD","CB","MCD","MC","MCO","EI","ED","DC","SD"].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.rivalTeamColor")}</label>
                      <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorBluePlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.ownFormation")}</label>
                      <select value={homeFormation} onChange={e => setHomeFormation(e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                        {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"].map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{t("vitasLab.specificPlayerRequiredHint")}</p>
                </div>
              )}

              {/* Selector de posición jugada en este video · multi-posición */}
              {selectedPlayerId && (() => {
                const selPlayer = players?.find((p) => p.id === selectedPlayerId);
                if (!selPlayer) return null;
                const declared = [selPlayer.position, ...(selPlayer.secondaryPositions ?? [])].filter(Boolean);
                const POSITIONS_FULL = [
                  "Portero", "Defensa Central", "Lateral Derecho", "Lateral Izquierdo",
                  "Pivote", "Mediocentro", "Mediapunta", "Extremo Derecho",
                  "Extremo Izquierdo", "Delantero",
                ];
                return (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">
                      {t("vitasLab.playedPositionInVideo")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {declared.map((p) => (
                        <button
                          key={`d-${p}`}
                          type="button"
                          onClick={() => setPlayedPosition(p)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-display border transition-colors ${
                            playedPosition === p
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary text-foreground border-border hover:border-primary/40"
                          }`}
                        >
                          {p === selPlayer.position ? `⭐ ${p}` : p}
                        </button>
                      ))}
                      <select
                        value={!declared.includes(playedPosition) ? playedPosition : ""}
                        onChange={(e) => setPlayedPosition(e.target.value)}
                        className="px-2 py-1 rounded-md text-[11px] font-display bg-secondary border border-border text-foreground"
                      >
                        <option value="">{t("vitasLab.otherPosition")}</option>
                        {POSITIONS_FULL.filter((p) => !declared.includes(p)).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      {t("vitasLab.defaultPositionHint")}
                    </p>
                  </div>
                );
              })()}

              {/* Selector de enfoque del análisis */}
              <AnalysisFocusSelector value={analysisFocus} onChange={setAnalysisFocus} />
            </div>
          </div>
    </>
  );
};

export default LabAnalysisConfig;
