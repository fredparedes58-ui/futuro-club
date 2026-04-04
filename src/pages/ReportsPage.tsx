/**
 * VITAS · ReportsPage
 * Centro de videos y análisis táctico.
 * Muestra videos reales de Bunny Stream + upload inline.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopNav from "@/components/TopNav";
import { Play, Search, Video, Upload, Zap, Clock, Trash2, ChevronDown, Brain } from "lucide-react";
import { useVideos, useDeleteVideo } from "@/hooks/useVideos";
import { useDeletePlayer } from "@/hooks/usePlayers";
import VideoCard from "@/components/VideoCard";
import VideoPlayer from "@/components/VideoPlayer";
import VideoUpload from "@/components/VideoUpload";
import { PlayerService } from "@/services/real/playerService";
import type { VideoRecord } from "@/services/real/videoService";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const ReportsPage = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<VideoRecord | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [jerseyNumber, setJerseyNumber] = useState<string>("");
  const [teamColor, setTeamColor] = useState<string>("");
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);

  const { data: realVideos = [], isLoading } = useVideos();
  const { mutate: deleteVideo } = useDeleteVideo();
  const { mutate: deletePlayer } = useDeletePlayer();

  const players = PlayerService.getAll();

  const filteredVideos = realVideos.filter((v) =>
    !searchQuery || v.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-screen pb-24">
      <TopNav />

      <div className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 space-y-6">

        {/* Header */}
        <motion.div variants={item} className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Centro de video</p>
            <h2 className="font-display text-2xl font-bold">Reportes y Videos</h2>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-display font-semibold hover:bg-primary/90 transition-colors"
          >
            <Upload size={14} />
            Subir Video
          </button>
        </motion.div>

        {/* Upload panel */}
        {showUpload && (
          <motion.div
            variants={item}
            className="glass rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Video size={14} className="text-primary" />
                <h3 className="font-display font-semibold text-sm text-foreground">Subir nuevo video</h3>
              </div>
              <button
                onClick={() => setShowUpload(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cerrar
              </button>
            </div>
            <VideoUpload
              onDone={(id) => {
                setShowUpload(false);
                const found = realVideos.find((v) => v.id === id);
                if (found) setSelectedVideo(found);
              }}
            />
          </motion.div>
        )}

        {/* Search */}
        <motion.div variants={item} className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm font-display text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">

          {/* Lista de videos */}
          <motion.div variants={item} className="space-y-4">
            <div className="glass rounded-xl p-4">
              <h3 className="font-display font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                <Video size={14} className="text-primary" />
                {isLoading ? "Cargando..." : `Mis videos (${filteredVideos.length})`}
              </h3>

              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />
                  ))}
                </div>
              ) : filteredVideos.length > 0 ? (
                <div className="space-y-2">
                  {filteredVideos.map((video) => (
                    <div
                      key={video.id}
                      onClick={() => setSelectedVideo(video)}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedVideo?.id === video.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="w-12 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <Play size={12} className="text-primary ml-0.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-medium text-foreground truncate">{video.title}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock size={9} className="text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            {video.dateUploaded ? new Date(video.dateUploaded).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : ""}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ml-1 ${
                            video.status === "finished"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {video.status === "finished" ? "Listo" : "Procesando"}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteVideo(video.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Video size={24} className="mx-auto mb-2 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground mb-3">
                    {searchQuery ? "Sin resultados" : "Sin videos todavía"}
                  </p>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="text-xs text-primary font-display font-semibold"
                  >
                    Subir primer video →
                  </button>
                </div>
              )}
            </div>

            {/* Jugadores con videos */}
            {players.length > 0 && (
              <div className="glass rounded-xl p-4">
                <h3 className="font-display font-bold text-sm text-foreground mb-3">
                  Analizar por jugador
                </h3>
                <div className="space-y-2">
                  {players.slice(0, 10).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-secondary/50 transition-colors group">
                      <button
                        onClick={() => navigate(`/players/${p.id}/intelligence`)}
                        className="flex items-center gap-3 flex-1 text-left min-w-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-primary">
                            {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-display font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.position} · VSI {p.vsi}</p>
                        </div>
                        <Zap size={10} className="text-primary shrink-0" />
                      </button>
                      <button
                        onClick={() => { if (confirm(`¿Eliminar a ${p.name}?`)) deletePlayer(p.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Player central */}
          <motion.div variants={item} className="glass rounded-xl p-5">
            {selectedVideo ? (
              <div className="space-y-4">
                <VideoPlayer video={selectedVideo} />
                <h3 className="font-display font-bold text-base text-foreground">{selectedVideo.title}</h3>

                {/* Selector de jugador */}
                <div className="space-y-3 p-4 rounded-xl bg-secondary/40 border border-border">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
                    Jugador a analizar
                  </p>

                  {/* Dropdown jugador */}
                  <div className="relative">
                    <button
                      onClick={() => setShowPlayerDropdown((v) => !v)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-background hover:bg-secondary transition-colors text-left"
                    >
                      <span className={`text-sm font-display font-semibold ${selectedPlayerId ? "text-foreground" : "text-muted-foreground"}`}>
                        {players.find(p => p.id === selectedPlayerId)?.name ?? "Seleccionar jugador…"}
                      </span>
                      <ChevronDown size={14} className="text-muted-foreground" />
                    </button>
                    {showPlayerDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background rounded-xl border border-border z-20 max-h-44 overflow-y-auto shadow-lg">
                        {players.length === 0 && (
                          <p className="text-xs text-muted-foreground px-3 py-2">No hay jugadores</p>
                        )}
                        {players.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => { setSelectedPlayerId(p.id); setShowPlayerDropdown(false); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors flex items-center justify-between ${selectedPlayerId === p.id ? "text-primary font-semibold" : "text-foreground"}`}
                          >
                            <span>{p.name}</span>
                            <span className="text-[10px] text-muted-foreground">{p.position}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Nº Camiseta + Color */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Nº Camiseta</label>
                      <input
                        type="text"
                        maxLength={3}
                        value={jerseyNumber}
                        onChange={(e) => setJerseyNumber(e.target.value)}
                        placeholder="Ej: 10"
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-display font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Color Uniforme</label>
                      <input
                        type="text"
                        value={teamColor}
                        onChange={(e) => setTeamColor(e.target.value)}
                        placeholder="Ej: Rojo"
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    La IA identificará al jugador por dorsal y color para el análisis individual.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (!selectedPlayerId) { alert("Selecciona un jugador primero"); return; }
                      navigate(`/players/${selectedPlayerId}/intelligence`);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-display font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Brain size={14} />
                    Analizar con VITAS
                  </button>
                  <button
                    onClick={() => navigate("/lab")}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-display font-semibold hover:bg-secondary transition-colors"
                  >
                    Abrir en Lab
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Play size={28} className="text-primary ml-1" />
                </div>
                <div>
                  <p className="font-display font-bold text-foreground mb-1">Selecciona un video</p>
                  <p className="text-xs text-muted-foreground">
                    Elige un video de la lista o sube uno nuevo
                  </p>
                </div>
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-display font-semibold hover:bg-primary/20 transition-colors"
                >
                  <Upload size={14} />
                  Subir video
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default ReportsPage;
