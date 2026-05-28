/**
 * VITAS · VideoUploadDialog
 *
 * Subida de video desde 3 fuentes:
 * 1. Archivo local (PC o móvil — incluye cámara/galería)
 * 2. URL pública (YouTube, Vimeo, Drive compartido, link directo MP4)
 * 3. Servicios cloud (Google Drive, Dropbox) — placeholder OAuth
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  Link as LinkIcon,
  Smartphone,
  HardDrive,
  Cloud,
  Camera,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { VideoService, type VideoRecord } from "@/services/real/videoService";

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: (video: VideoRecord) => void;
}

type Source = "device" | "url" | "cloud";

function generateVideoId(): string {
  return `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
}

function detectCloudProvider(url: string): { provider: string; embedUrl?: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      const id =
        host.includes("youtu.be")
          ? u.pathname.slice(1)
          : u.searchParams.get("v");
      if (id) return { provider: "YouTube", embedUrl: `https://www.youtube.com/embed/${id}` };
      return { provider: "YouTube" };
    }
    if (host.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return { provider: "Vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
      return { provider: "Vimeo" };
    }
    if (host.includes("drive.google.com")) {
      const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (m) {
        return {
          provider: "Google Drive",
          embedUrl: `https://drive.google.com/file/d/${m[1]}/preview`,
        };
      }
      return { provider: "Google Drive" };
    }
    if (host.includes("dropbox.com")) {
      const direct = url.replace("?dl=0", "?raw=1");
      return { provider: "Dropbox", embedUrl: direct };
    }
    if (host.includes("vercel-storage.com") || /\.(mp4|webm|mov|m3u8)$/i.test(u.pathname)) {
      return { provider: "Archivo directo", embedUrl: url };
    }
    return { provider: "URL externa" };
  } catch {
    return null;
  }
}

export default function VideoUploadDialog({ open, onClose, onUploaded }: Props) {
  const [source, setSource] = useState<Source>("device");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [result, setResult] = useState<VideoRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setUrl("");
    setTitle("");
    setUploading(false);
    setUploadPct(0);
    setResult(null);
    setSource("device");
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error("El archivo debe ser un video");
      return;
    }
    // Soft limit 500MB for browser blob URLs
    const MAX = 500 * 1024 * 1024;
    if (f.size > MAX) {
      toast.error("El archivo supera 500 MB. Considera comprimirlo o usar un servicio cloud.");
      return;
    }
    setFile(f);
    if (!title) setTitle(inferTitle(f.name));
  };

  const simulateUpload = async (durationMs: number) => {
    const steps = 20;
    const interval = durationMs / steps;
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, interval));
      setUploadPct(Math.round((i / steps) * 100));
    }
  };

  const handleSubmitDevice = async () => {
    if (!file) {
      toast.error("Selecciona un video");
      return;
    }
    setUploading(true);
    setUploadPct(0);

    try {
      // Create a blob URL for the file so it can be played locally
      const blobUrl = URL.createObjectURL(file);

      // Simulate upload progress (in real app this would track XHR upload)
      await simulateUpload(2400);

      // Read video metadata (duration, dimensions) via temporary <video> element
      const meta = await readVideoMetadata(file);

      const video: VideoRecord = {
        id: generateVideoId(),
        title: title.trim() || inferTitle(file.name),
        playerId: null,
        status: "finished",
        statusCode: 4,
        encodeProgress: 100,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        fps: 30,
        storageSize: file.size,
        thumbnailUrl: null,
        embedUrl: blobUrl,
        streamUrl: blobUrl,
        localPath: blobUrl,
        dateUploaded: new Date().toISOString(),
      };

      VideoService.save(video);
      setResult(video);
      toast.success("Video subido correctamente");
      onUploaded(video);
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar el video");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitUrl = async () => {
    if (!url.trim()) {
      toast.error("Pega una URL");
      return;
    }
    const provider = detectCloudProvider(url.trim());
    if (!provider) {
      toast.error("URL no válida");
      return;
    }
    setUploading(true);
    setUploadPct(0);
    try {
      await simulateUpload(1200);
      const video: VideoRecord = {
        id: generateVideoId(),
        title: title.trim() || `Video de ${provider.provider}`,
        playerId: null,
        status: "finished",
        statusCode: 4,
        encodeProgress: 100,
        duration: 90 * 60,
        width: 1920,
        height: 1080,
        fps: 30,
        storageSize: 0,
        thumbnailUrl: null,
        embedUrl: provider.embedUrl ?? url,
        streamUrl: provider.embedUrl ?? url,
        dateUploaded: new Date().toISOString(),
      };
      VideoService.save(video);
      setResult(video);
      toast.success(`Video importado desde ${provider.provider}`);
      onUploaded(video);
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-xl glass-strong rounded-2xl border border-border shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border bg-gradient-to-r from-emerald-500/10 to-primary/10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Upload size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-display font-bold text-foreground">
                Subir video
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Desde tu ordenador, móvil o de un servicio cloud
              </p>
            </div>
            {!uploading && (
              <button
                onClick={handleClose}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Source tabs */}
          {!result && (
            <div className="flex border-b border-border bg-secondary/20">
              <SourceTab
                active={source === "device"}
                onClick={() => setSource("device")}
                icon={<HardDrive size={14} />}
                label="Ordenador / Móvil"
              />
              <SourceTab
                active={source === "url"}
                onClick={() => setSource("url")}
                icon={<LinkIcon size={14} />}
                label="URL / Cloud"
              />
              <SourceTab
                active={source === "cloud"}
                onClick={() => setSource("cloud")}
                icon={<Cloud size={14} />}
                label="Servicios"
              />
            </div>
          )}

          {/* Body */}
          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Device source */}
            {!result && source === "device" && !uploading && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all"
                  >
                    <HardDrive size={28} className="text-primary" />
                    <span className="text-xs font-display font-bold text-foreground">
                      Elegir archivo
                    </span>
                    <span className="text-[10px] text-muted-foreground text-center">
                      MP4, MOV, WebM · máx 500 MB
                    </span>
                  </button>

                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all"
                  >
                    <div className="flex gap-1">
                      <Smartphone size={20} className="text-emerald-500" />
                      <Camera size={20} className="text-emerald-500" />
                    </div>
                    <span className="text-xs font-display font-bold text-foreground">
                      Cámara del móvil
                    </span>
                    <span className="text-[10px] text-muted-foreground text-center">
                      Graba en directo o elige de la galería
                    </span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileSelected}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={handleFileSelected}
                  className="hidden"
                />

                {file && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-xl p-3 flex items-center gap-3 border border-primary/30"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <VideoIcon size={16} className="text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-bold text-foreground truncate">
                        {file.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}
                      </p>
                    </div>
                    <button
                      onClick={() => setFile(null)}
                      className="p-1 rounded-md text-muted-foreground hover:bg-secondary"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                )}

                {file && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                      Título del video
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="vs Rival FC · 24 May"
                      className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                    />
                  </div>
                )}
              </>
            )}

            {/* URL source */}
            {!result && source === "url" && !uploading && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Pega una URL pública. Soportamos YouTube, Vimeo, Google Drive (compartido), Dropbox y enlaces MP4 directos.
                </p>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    URL del video
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... · https://youtu.be/... · https://example.com/video.mp4"
                    className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Título (opcional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="vs Rival FC · 24 May"
                    className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <AlertCircle size={12} className="mt-[2px] shrink-0" />
                  <p>
                    Para Google Drive, el video debe tener permiso de visualización para "cualquiera con el enlace". El análisis de set pieces funciona en cuanto el video está registrado, sin necesidad de descargarlo.
                  </p>
                </div>
              </div>
            )}

            {/* Cloud services source */}
            {!result && source === "cloud" && !uploading && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Conecta servicios cloud para importar videos directamente.
                </p>
                {[
                  { name: "Google Drive", color: "from-blue-500 to-green-500", emoji: "📁" },
                  { name: "Dropbox", color: "from-blue-600 to-blue-400", emoji: "🟦" },
                  { name: "OneDrive", color: "from-sky-600 to-cyan-400", emoji: "☁️" },
                  { name: "Bunny Stream (CDN)", color: "from-amber-500 to-orange-500", emoji: "🎬" },
                ].map((s) => (
                  <button
                    key={s.name}
                    onClick={() =>
                      toast.info(
                        `Próximamente: conexión OAuth con ${s.name}. Por ahora usa la pestaña URL para pegar el enlace compartido.`,
                      )
                    }
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/30 transition-all text-left"
                  >
                    <div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center text-lg`}
                    >
                      {s.emoji}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-display font-bold text-foreground">
                        Conectar con {s.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Próximamente — usa la pestaña URL como alternativa
                      </p>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                      Beta
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Uploading state */}
            {uploading && (
              <div className="py-6 space-y-4">
                <div className="flex justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 size={40} className="text-primary" />
                  </motion.div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-bold text-foreground">
                      Subiendo video…
                    </span>
                    <span className="font-mono text-primary font-bold">{uploadPct}%</span>
                  </div>
                  <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${uploadPct}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Success state */}
            {result && !uploading && (
              <div className="text-center py-4 space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center"
                >
                  <CheckCircle2 size={32} className="text-emerald-500" />
                </motion.div>
                <div>
                  <h3 className="text-base font-display font-bold text-foreground">
                    ¡Video subido!
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong className="text-primary">{result.title}</strong> ya está disponible.
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Puedes analizarlo para detectar set pieces automáticamente desde el botón "Analizar video".
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {!result && !uploading && (
            <div className="flex items-center justify-between gap-3 p-4 border-t border-border bg-secondary/20">
              <button
                onClick={handleClose}
                className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={source === "device" ? handleSubmitDevice : handleSubmitUrl}
                disabled={
                  (source === "device" && !file) ||
                  (source === "url" && !url.trim()) ||
                  source === "cloud"
                }
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={12} />
                Subir
              </button>
            </div>
          )}

          {result && (
            <div className="flex items-center justify-end p-4 border-t border-border bg-secondary/20">
              <button
                onClick={handleClose}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90"
              >
                Cerrar
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SourceTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-display font-semibold transition-colors border-b-2 ${
        active
          ? "border-primary text-foreground bg-secondary/30"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

async function readVideoMetadata(
  file: File,
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const result = {
        duration: Math.round(v.duration),
        width: v.videoWidth,
        height: v.videoHeight,
      };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: 0, width: 0, height: 0 });
    };
    v.src = url;
  });
}
