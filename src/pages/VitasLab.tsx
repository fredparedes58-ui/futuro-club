import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  RotateCcw,
  Camera,
  Play,
  Pause,
  Users,
  ScanSearch,
  Swords,
  UserRound,
  Rocket,
  ArrowLeft,
} from "lucide-react";
import pitchImage from "@/assets/pitch-field.jpg";

interface CalibrationPoint {
  id: number;
  x: number;
  y: number;
  label: string;
}

const steps = [
  { id: 1, label: "UPLOAD", done: true },
  { id: 2, label: "MAPPING", active: true },
  { id: 3, label: "PROCESS", done: false },
];

const analysisModes = [
  {
    id: "all",
    label: "All Players",
    desc: "Global pitch coverage & team heatmaps",
    icon: Users,
  },
  {
    id: "click",
    label: "Click-to-Track",
    desc: "Focus on individual manual selection",
    icon: ScanSearch,
  },
  {
    id: "team",
    label: "Full Team",
    desc: "Compare Home vs Away tactical blocks",
    icon: Swords,
  },
  {
    id: "player",
    label: "Specific Player",
    desc: "Filter by jersey number and position",
    icon: UserRound,
  },
];

const VitasLab = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedMode, setSelectedMode] = useState("all");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(862); // 14:22 in seconds
  const totalTime = 5400; // 1:30:00

  const [points, setPoints] = useState<CalibrationPoint[]>([
    { id: 1, x: 28, y: 62, label: "P1" },
    { id: 2, x: 72, y: 62, label: "P2" },
    { id: 3, x: 80, y: 92, label: "P3" },
    { id: 4, x: 20, y: 92, label: "P4" },
  ]);

  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Draw calibration overlay
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (points.length < 2) return;

    // Draw connecting lines (cyan quadrilateral)
    ctx.strokeStyle = "hsl(180, 100%, 60%)";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    const orderedPts = [...points].sort((a, b) => a.id - b.id);
    orderedPts.forEach((pt, i) => {
      const px = (pt.x / 100) * canvas.width;
      const py = (pt.y / 100) * canvas.height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    // Fill with semi-transparent cyan
    ctx.fillStyle = "hsla(180, 100%, 60%, 0.06)";
    ctx.fill();

    // Draw points
    points.forEach((pt) => {
      const px = (pt.x / 100) * canvas.width;
      const py = (pt.y / 100) * canvas.height;

      // Glow
      ctx.shadowColor = "hsl(0, 80%, 55%)";
      ctx.shadowBlur = 10;

      // Red dot
      ctx.fillStyle = "hsl(0, 80%, 55%)";
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = "hsl(180, 100%, 70%)";
      ctx.font = "11px Rajdhani";
      const coordLabel = `${pt.label}: ${Math.round((pt.x / 100) * 1050)}, ${Math.round((pt.y / 100) * 680)}`;
      ctx.fillText(coordLabel, px - 30, py - 12);
    });
  }, [points]);

  useEffect(() => {
    drawOverlay();
    window.addEventListener("resize", drawOverlay);
    return () => window.removeEventListener("resize", drawOverlay);
  }, [drawOverlay]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;

    const closest = points.find((pt) => {
      const dx = pt.x - mx;
      const dy = pt.y - my;
      return Math.sqrt(dx * dx + dy * dy) < 4;
    });
    if (closest) setDraggingPoint(closest.id);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingPoint === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const my = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    setPoints((prev) =>
      prev.map((pt) => (pt.id === draggingPoint ? { ...pt, x: mx, y: my } : pt))
    );
  };

  const handleCanvasMouseUp = () => setDraggingPoint(null);

  const resetPoints = () => {
    setPoints([
      { id: 1, x: 28, y: 62, label: "P1" },
      { id: 2, x: 72, y: 62, label: "P2" },
      { id: 3, x: 80, y: 92, label: "P3" },
      { id: 4, x: 20, y: 92, label: "P4" },
    ]);
  };

  // Simulate playback
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((t) => (t >= totalTime ? 0 : t + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const progressPercent = (currentTime / totalTime) * 100;

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="min-h-screen flex flex-col"
    >
      {/* Top Nav */}
      <motion.div variants={item} className="glass-strong px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Camera size={16} className="text-primary" />
            </div>
            <span className="font-display font-bold text-foreground text-lg">
              VITAS<span className="text-muted-foreground">.LAB</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 ml-6">
            {["DASHBOARD", "NEW ANALYSIS", "ARCHIVE", "MODELS"].map((link, i) => (
              <span
                key={link}
                className={`text-xs font-display font-semibold tracking-wider cursor-pointer transition-colors ${
                  i === 1 ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-display text-primary uppercase tracking-wider">
              SYSTEM_STATUS: <span className="text-primary">ACTIVE</span>
            </span>
            <br />
            <span className="text-[10px] font-display text-muted-foreground tracking-wider">
              TOKEN_EXP: 14:22:04
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
            <UserRound size={14} className="text-muted-foreground" />
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Stepper */}
        <motion.div variants={item} className="hidden md:flex flex-col items-center py-8 px-4 gap-2 border-r border-border">
          {steps.map((step, i) => (
            <div key={step.id} className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-display font-bold border-2 ${
                  step.done
                    ? "border-primary bg-primary/10 text-primary"
                    : step.active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {step.done ? <CheckCircle2 size={18} /> : step.id}
              </div>
              <span
                className={`text-[9px] font-display font-semibold uppercase tracking-widest mt-1 ${
                  step.done || step.active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`w-0.5 h-10 my-1 ${step.done ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </motion.div>

        {/* Center - Pitch + Video */}
        <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 overflow-hidden">
          {/* Title */}
          <motion.div variants={item} className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display font-bold text-2xl text-foreground">
                Pitch Homography Setup
              </h1>
              <p className="text-sm text-muted-foreground">
                Define reference points for 2D perspective mapping.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetPoints}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-display font-semibold text-foreground hover:bg-secondary transition-colors"
              >
                <RotateCcw size={14} />
                RESET POINTS
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-display font-semibold text-foreground hover:bg-secondary transition-colors">
                <Camera size={14} />
                AUTO-DETECT
              </button>
            </div>
          </motion.div>

          {/* Pitch Canvas */}
          <motion.div
            variants={item}
            ref={containerRef}
            className="relative flex-1 min-h-[300px] rounded-xl overflow-hidden border border-border"
          >
            <img
              src={pitchImage}
              alt="Football pitch"
              className="w-full h-full object-cover"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
            {/* Calibration Status */}
            <div className="absolute bottom-4 left-4 glass rounded-lg px-4 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-[11px] font-display font-semibold text-foreground tracking-wider">
                CALIBRATION ACTIVE:{" "}
                <span className="text-muted-foreground">
                  {points.length} OF 4 POINTS ASSIGNED. PERSPECTIVE SOLVED.
                </span>
              </span>
            </div>
          </motion.div>

          {/* Video Timeline */}
          <motion.div variants={item} className="glass rounded-xl px-4 py-3 flex items-center gap-4">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div className="flex-1 relative h-2 bg-muted rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                setCurrentTime(Math.round(pct * totalTime));
              }}
            >
              {/* Buffered */}
              <div
                className="absolute inset-y-0 left-0 bg-primary/30 rounded-full"
                style={{ width: `${Math.min(progressPercent + 15, 100)}%` }}
              />
              {/* Progress */}
              <motion.div
                className="absolute inset-y-0 left-0 bg-primary rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-display text-muted-foreground tabular-nums min-w-[120px] text-right">
              {formatTime(currentTime)} / {formatTime(totalTime)}
            </span>
          </motion.div>
        </div>

        {/* Right Sidebar */}
        <motion.div
          variants={item}
          className="hidden lg:flex flex-col w-72 border-l border-border p-5 gap-6"
        >
          {/* Coordinate Realtime */}
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Coordinate Realtime
            </span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="glass rounded-lg p-3">
                <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
                  FIELD_X
                </span>
                <p className="font-display font-bold text-xl text-primary">105.00m</p>
              </div>
              <div className="glass rounded-lg p-3">
                <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
                  FIELD_Y
                </span>
                <p className="font-display font-bold text-xl text-primary">68.00m</p>
              </div>
            </div>
          </div>

          {/* Analysis Mode */}
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Analysis Mode
            </span>
            <div className="flex flex-col gap-2 mt-3">
              {analysisModes.map((mode) => {
                const Icon = mode.icon;
                const active = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        active ? "bg-primary/10" : "bg-secondary"
                      }`}
                    >
                      <Icon size={18} className={active ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div>
                      <h4 className={`font-display font-bold text-sm ${active ? "text-foreground" : "text-foreground"}`}>
                        {mode.label}
                      </h4>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {mode.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start Analysis */}
          <div className="mt-auto">
            <button className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors">
              START ANALYSIS
              <Rocket size={16} />
            </button>
            <p className="text-center text-[10px] font-display text-muted-foreground mt-2 tracking-wider">
              ESTIMATED_TIME: 12m 45s
            </p>
          </div>
        </motion.div>
      </div>

      {/* Bottom Status Bar */}
      <motion.div
        variants={item}
        className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] font-display text-muted-foreground tracking-wider"
      >
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            GPU_LOAD: 42%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            RAM_USAGE: 4.8GB
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            ENGINE: YOLOv11M
          </span>
        </div>
        <span>VITAS_STATION_004 // BUILD_2.0.42</span>
      </motion.div>
    </motion.div>
  );
};

export default VitasLab;
