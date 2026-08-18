/**
 * VITAS — Velocidad de Sprint
 * Ruta: /velocidad-sprint
 *
 * Mide la velocidad de un sprint sobre una distancia CONOCIDA por cronometraje entre
 * marcas (gate timing): velocidad = distancia ÷ tiempo, con el tiempo contado en frames.
 * No necesita calibración de cámara → distancia MEDIDA (cinta) ÷ tiempo MEDIDA (frames)
 * ⇒ velocidad DERIVADA. Todo corre en el navegador; el vídeo no se sube a ningún sitio.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowLeft, Gauge, Upload, Flag, Play, Pause, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerService } from "@/services/real/playerService";
import { SprintTestService, type SprintTest } from "@/services/real/sprintTestService";

export default function SprintSpeed() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(30);
  const [distance, setDistance] = useState(15);
  const [startFrame, setStartFrame] = useState<number | null>(null);
  const [finishFrame, setFinishFrame] = useState<number | null>(null);

  // Guardar al perfil: el test pertenece a un jugador (módulos que conversan)
  const [players] = useState(() => PlayerService.getAll());
  const [playerId, setPlayerId] = useState<string>("");
  const [history, setHistory] = useState<SprintTest[]>([]);
  useEffect(() => {
    setHistory(playerId ? SprintTestService.getByPlayer(playerId) : []);
  }, [playerId]);

  const curFrame = Math.round(currentTime * fps);
  const totalFrames = Math.round(duration * fps);

  // ── carga de vídeo ──
  function loadFile(f: File | undefined) {
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(f));
    setStartFrame(null);
    setFinishFrame(null);
  }
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  // ── transporte ──
  function step(nFrames: number) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, Math.min(duration || 0, v.currentTime + nFrames / fps));
  }
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  // ── atajos de teclado ──
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
      else if (e.key === " ") { togglePlay(); e.preventDefault(); }
      else if (e.key === "s" || e.key === "S") setStartFrame(Math.round((videoRef.current?.currentTime ?? 0) * fps));
      else if (e.key === "l" || e.key === "L") setFinishFrame(Math.round((videoRef.current?.currentTime ?? 0) * fps));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fps, duration]);

  // ── resultado ──
  const result = useMemo(() => {
    if (startFrame == null || finishFrame == null || finishFrame <= startFrame || distance <= 0 || fps <= 0) return null;
    const time = (finishFrame - startFrame) / fps;
    const ms = distance / time;
    const errPct = ((1 / fps) / time) * 100; // ±1 frame
    return { time, ms, kmh: ms * 3.6, errPct };
  }, [startFrame, finishFrame, distance, fps]);

  const marksInvalid = startFrame != null && finishFrame != null && finishFrame <= startFrame;

  function saveTest() {
    if (!result || !playerId) return;
    SprintTestService.add({
      playerId,
      fecha: new Date().toISOString().slice(0, 10),
      distancia_m: distance,
      tiempo_s: +result.time.toFixed(3),
      velocidad_ms: +result.ms.toFixed(2),
      velocidad_kmh: +result.kmh.toFixed(1),
      fps,
      error_pct: +result.errPct.toFixed(1),
    });
    setHistory(SprintTestService.getByPlayer(playerId));
    toast.success(t("sprintSpeed.savedToast"));
  }

  function removeTest(id: string) {
    SprintTestService.remove(id);
    setHistory(playerId ? SprintTestService.getByPlayer(playerId) : []);
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={18} />
          </Button>
          <Gauge size={20} className="text-primary" />
          <h1 className="text-lg font-display font-bold">{t("sprintSpeed.title")}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("sprintSpeed.intro")}
        </p>

        {/* carga */}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/*"
          className="hidden"
          onChange={(e) => loadFile(e.target.files?.[0])}
        />

        {!url ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border-2 border-dashed border-border p-10 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]); }}
          >
            <Upload className="mx-auto mb-3 text-muted-foreground" size={28} />
            <p className="font-medium mb-1">{t("sprintSpeed.uploadPrompt")}</p>
            <p className="text-xs text-muted-foreground mb-4">{t("sprintSpeed.uploadHint")}</p>
            <Button onClick={() => inputRef.current?.click()}>{t("sprintSpeed.chooseVideo")}</Button>
          </motion.div>
        ) : (
          <>
            {/* vídeo */}
            <div className="rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                src={url}
                playsInline
                className="w-full max-h-[60vh] object-contain bg-black"
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            </div>

            {/* transporte */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => step(-10)}>⏮ -10</Button>
              <Button variant="outline" size="sm" onClick={() => step(-1)}>◀ -1</Button>
              <Button variant="outline" size="icon" onClick={togglePlay} aria-label="Play/Pause">
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </Button>
              <Button variant="outline" size="sm" onClick={() => step(1)}>+1 ▶</Button>
              <Button variant="outline" size="sm" onClick={() => step(10)}>+10 ⏭</Button>
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.001}
              value={currentTime}
              onChange={(e) => { const v = videoRef.current; if (v) { v.pause(); v.currentTime = Number(e.target.value); } }}
              className="w-full"
            />
            <div className="text-center text-xs text-muted-foreground tabular-nums">
              {t("sprintSpeed.frameLabel", { frame: curFrame, time: currentTime.toFixed(3), total: totalFrames })}
            </div>

            {/* datos */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="dist" className="text-xs">{t("sprintSpeed.distanceLabel")}</Label>
                <Input id="dist" type="number" min={0} step={0.5} value={distance}
                  onChange={(e) => setDistance(Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="fps" className="text-xs">{t("sprintSpeed.fpsLabel")}</Label>
                <Input id="fps" type="number" min={1} step={1} value={fps}
                  onChange={(e) => setFps(Number(e.target.value))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("sprintSpeed.fpsHint")}</p>

            {/* marcar */}
            <div className="grid grid-cols-2 gap-3">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setStartFrame(curFrame)}>
                <Flag size={16} className="mr-1" /> {t("sprintSpeed.markStart")}
              </Button>
              <Button className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => setFinishFrame(curFrame)}>
                <Flag size={16} className="mr-1" /> {t("sprintSpeed.markFinish")}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums flex justify-between">
              <span>{t("sprintSpeed.startAt")}: <b className="text-foreground">{startFrame == null ? "—" : `${startFrame} (${(startFrame / fps).toFixed(3)} s)`}</b></span>
              <span>{t("sprintSpeed.finishAt")}: <b className="text-foreground">{finishFrame == null ? "—" : `${finishFrame} (${(finishFrame / fps).toFixed(3)} s)`}</b></span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("sprintSpeed.shortcuts")}</p>

            {/* resultado */}
            <div className="rounded-xl border border-border p-5 text-center">
              {result ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="text-4xl font-black tabular-nums">{t("sprintSpeed.speedMs", { value: result.ms.toFixed(2) })}</div>
                  <div className="text-lg font-bold text-primary">{t("sprintSpeed.speedKmh", { value: result.kmh.toFixed(1) })}</div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {t("sprintSpeed.timeSummary", { dist: distance, time: result.time.toFixed(3), err: result.errPct.toFixed(1) })}
                  </div>
                  <span className="inline-block mt-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-500 text-emerald-600 bg-emerald-500/10">
                    {t("sprintSpeed.provenanceBadge")}
                  </span>
                </motion.div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {marksInvalid ? <span className="text-destructive">{t("sprintSpeed.finishAfterStart")}</span> : t("sprintSpeed.needMarks")}
                </div>
              )}
            </div>

            {/* Guardar en el perfil del jugador — el test no se pierde en la página */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
                {t("sprintSpeed.savePanelTitle")}
              </p>
              {players.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("sprintSpeed.noPlayers")}</p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={playerId}
                    onChange={(e) => setPlayerId(e.target.value)}
                    className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t("sprintSpeed.selectPlayer")}</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} · {p.position}</option>
                    ))}
                  </select>
                  <Button onClick={saveTest} disabled={!result || !playerId}>
                    <Save size={15} className="mr-1" /> {t("sprintSpeed.save")}
                  </Button>
                </div>
              )}

              {playerId && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {t("sprintSpeed.historyTitle")}
                    </p>
                    <Link to={`/players/${playerId}`} className="text-[11px] text-primary font-semibold hover:underline">
                      {t("sprintSpeed.viewProfile")} →
                    </Link>
                  </div>
                  {history.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{t("sprintSpeed.historyEmpty")}</p>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} className="flex items-center justify-between text-[11px] tabular-nums border-b border-border/50 py-1">
                        <span className="text-muted-foreground">{h.fecha}</span>
                        <span>{h.distancia_m} m · {h.tiempo_s}s</span>
                        <span className="font-bold">{h.velocidad_ms} m/s ({h.velocidad_kmh} km/h)</span>
                        <button onClick={() => removeTest(h.id)} aria-label="delete" className="text-muted-foreground hover:text-destructive">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => { setStartFrame(null); setFinishFrame(null); }}>
                <RotateCcw size={14} className="mr-1" /> {t("sprintSpeed.reset")}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
