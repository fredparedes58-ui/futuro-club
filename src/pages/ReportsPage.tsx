import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopNav from "@/components/TopNav";
import {
  Play, Search, Clock, Video, ChevronRight, Upload
} from "lucide-react";
import { useVideos } from "@/hooks/useVideos";
import VideoCard from "@/components/VideoCard";
import VideoPlayer from "@/components/VideoPlayer";
import VideoUpload from "@/components/VideoUpload";
import { useDeleteVideo } from "@/hooks/useVideos";
import type { VideoRecord } from "@/services/real/videoService";

const mockVideos = [
  {
    id: "v1",
    title: "Jude Bellingham: Midfield Maestro Analysis",
    thumbnail: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=400&h=225&fit=crop",
    duration: "3:55",
    views: "12.4K",
    featured: true,
  },
  {
    id: "v2",
    title: "Kylian Mbappé: Goals of the Month",
    thumbnail: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=225&fit=crop",
    duration: "5:12",
    views: "8.9K",
  },
  {
    id: "v3",
    title: "Tactical Breakdown: High Press Systems",
    thumbnail: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&h=225&fit=crop",
    duration: "7:30",
    views: "5.2K",
  },
  {
    id: "v4",
    title: "Youth Academy: Rising Stars 2026",
    thumbnail: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&h=225&fit=crop",
    duration: "4:18",
    views: "3.1K",
  },
];

const mockAnalysisVideos = [
  { id: "av1", title: "Jude Bellingham: Midfield Maestro Analysis", type: "Analysis" },
  { id: "av2", title: "Kylian Mbappé: Goals of the Month", type: "Highlight" },
  { id: "av3", title: "Jude Bellingham: Midfield Maestro Breakdown", type: "Breakdown" },
  { id: "av4", title: "Kylian Mbappé: Goals Compilation", type: "Compilation" },
];

const mockStories = [
  {
    id: "n1",
    title: "Jude Bellingham: Midfield Maestro Analysis vs. Real Madrid, high pressing",
    time: "2h ago",
  },
  {
    id: "n2",
    title: "Kylian Mbappé highlights from recent match performance data analysis",
    time: "4h ago",
  },
  {
    id: "n3",
    title: "Tyriam Mbappé: Goals of the month analysis and scouting report",
    time: "6h ago",
  },
  {
    id: "n4",
    title: "Kylian Mbappé: Round 2 analysis complete with tactical breakdown",
    time: "8h ago",
  },
];

const mockTicker = [
  "Jude Bellingham: Midfield Maestro - Complete Breakdown",
  "Team 1 - 2 United",
  "Real Madrid - Kylian Mbappé: Goals of the Month",
];

const ReportsPage = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<VideoRecord | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const { data: realVideos = [], isLoading: videosLoading } = useVideos();
  const { mutate: deleteVideo } = useDeleteVideo();

  // Blend real videos with mock fallback for demo
  const hasRealVideos = realVideos.length > 0;
  const featuredVideo = hasRealVideos ? null : mockVideos[0];

  // Filter real videos by search
  const filteredRealVideos = realVideos.filter((v) =>
    !searchQuery || v.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter mock stories by search
  const filteredStories = mockStories.filter((s) =>
    !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-screen">
      <TopNav />

      {/* Fase 2 Banner */}
      <motion.div variants={item} className="max-w-7xl mx-auto px-6 pt-4">
        <div className="glass rounded-xl p-4 border border-primary/20 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Video size={14} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-display font-semibold text-foreground">Videos reales disponibles en Fase 2</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Esta vista muestra contenido de ejemplo. En Fase 2 verás los videos de tus jugadores almacenados en Bunny Stream con análisis automático.
            </p>
          </div>
          <span className="text-[9px] font-display font-bold uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary shrink-0">
            FASE 2
          </span>
        </div>
      </motion.div>

      {/* Search Bar */}
      <motion.div variants={item} className="max-w-7xl mx-auto px-6 pt-6">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search players, teams, or competitions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-card border border-border text-foreground text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </div>
      </motion.div>

      {/* Ticker */}
      <motion.div variants={item} className="max-w-7xl mx-auto px-6 mt-4">
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-card border border-border overflow-hidden">
          <span className="text-[10px] font-display font-bold uppercase tracking-wider text-primary whitespace-nowrap">
            Scouting Feed Ticker
          </span>
          <div className="flex-1 overflow-hidden">
            <motion.div
              className="flex gap-8 whitespace-nowrap"
              animate={{ x: [0, -600] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              {mockTicker.concat(mockTicker).map((text, i) => (
                <span key={i} className="text-xs font-display text-muted-foreground flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center">⚽</span>
                  {text}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-12 grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-6">

        {/* Left Column: Video Thumbnails + News */}
        <motion.div variants={item} className="space-y-6">
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-bold text-lg text-foreground mb-4">
              {hasRealVideos ? `Mis Videos (${realVideos.length})` : "Scouting Video Thumbnails"}
            </h2>
            {videosLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-video rounded-lg bg-secondary animate-pulse" />
                ))}
              </div>
            ) : hasRealVideos ? (
              <div className="grid grid-cols-2 gap-3">
                {filteredRealVideos.slice(0, 4).map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onClick={(v) => setSelectedVideo(v)}
                    showDelete
                    onDelete={(id) => deleteVideo(id)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {mockVideos.slice(0, 4).map((video) => (
                  <div key={video.id} className="cursor-pointer group">
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-secondary mb-2">
                      <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center group-hover:bg-primary/80 transition-colors">
                          <Play size={16} className="text-foreground ml-0.5" />
                        </div>
                      </div>
                      <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-background/70 text-[10px] font-display text-foreground">
                        {video.duration}
                      </div>
                    </div>
                    <p className="text-[11px] font-display font-medium text-foreground/80 leading-tight line-clamp-2">
                      {video.title}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-bold text-lg text-foreground mb-4">
              News Article Cards
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {mockVideos.slice(1, 3).map((video) => (
                <div key={`news-${video.id}`} className="cursor-pointer group">
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-secondary mb-2">
                    <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center">
                        <Play size={16} className="text-foreground ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] font-display font-medium text-foreground/80 leading-tight line-clamp-2">
                    {video.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Center Column: Featured Report */}
        <motion.div variants={item} className="glass rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-foreground">
              {hasRealVideos ? "Video Seleccionado" : "Featured Report"}
            </h2>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-display font-semibold hover:bg-primary/20 transition-colors"
            >
              <Upload size={12} />
              Subir video
            </button>
          </div>

          {/* Upload panel inline */}
          {showUpload && (
            <div className="mb-4 p-4 rounded-xl border border-border bg-secondary/30">
              <VideoUpload
                onDone={(id) => {
                  setShowUpload(false);
                  const found = realVideos.find((v) => v.id === id);
                  if (found) setSelectedVideo(found);
                }}
              />
            </div>
          )}

          {/* Real video player */}
          {selectedVideo ? (
            <>
              <VideoPlayer video={selectedVideo} className="mb-4" />
              <h3 className="font-display font-bold text-xl text-foreground mb-2">
                {selectedVideo.title}
              </h3>
              {selectedVideo.analysisResult ? (
                <div className="p-3 rounded-lg bg-secondary space-y-2 mb-4">
                  <p className="text-xs font-display font-semibold text-primary">
                    {selectedVideo.analysisResult.formationHint}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedVideo.analysisResult.notes}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedVideo.analysisResult.keyMovements.map((m, i) => (
                      <span key={i} className="text-[9px] font-display px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Sin análisis táctico. Ejecuta el pipeline para generar insights con IA.
                </p>
              )}
              <div className="flex items-center gap-3 mt-auto">
                <button
                  onClick={() => navigate("/lab")}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:bg-primary/90 transition-colors"
                >
                  Abrir en Lab
                </button>
                <button
                  onClick={() => navigate("/compare")}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-display font-semibold text-foreground hover:bg-secondary transition-colors"
                >
                  Compare
                </button>
              </div>
            </>
          ) : hasRealVideos && filteredRealVideos.length > 0 ? (
            /* Real videos grid — click to feature */
            <div className="grid grid-cols-2 gap-3">
              {filteredRealVideos.slice(0, 4).map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onClick={(v) => setSelectedVideo(v)}
                  onDelete={(id) => deleteVideo(id)}
                  showDelete
                />
              ))}
              {filteredRealVideos.length > 4 && (
                <div className="col-span-2 text-center">
                  <span className="text-xs text-muted-foreground font-display">
                    +{filteredRealVideos.length - 4} más · Usa la búsqueda para filtrar
                  </span>
                </div>
              )}
            </div>
          ) : !hasRealVideos && featuredVideo ? (
            /* Mock fallback */
            <>
              <div className="relative aspect-video rounded-xl overflow-hidden bg-secondary mb-4 group cursor-pointer">
                <img src={featuredVideo.thumbnail} alt={featuredVideo.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-primary/80 backdrop-blur-sm flex items-center justify-center group-hover:bg-primary transition-colors group-hover:scale-110 duration-300">
                    <Play size={28} className="text-primary-foreground ml-1" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-center gap-3">
                  <Play size={14} className="text-foreground" />
                  <div className="flex-1 h-1 rounded-full bg-muted-foreground/30 overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-primary" />
                  </div>
                  <span className="text-[10px] font-display text-foreground/70">0:00 / {featuredVideo.duration}</span>
                </div>
              </div>
              <h3 className="font-display font-bold text-xl text-foreground mb-2">
                Featured Report: {featuredVideo.title.split(":")[0]} - Complete Breakdown
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Contenido de ejemplo. Sube un video real para ver análisis táctico en vivo.
              </p>
              <div className="flex items-center gap-3 mt-auto">
                <button
                  onClick={() => setShowUpload(true)}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:bg-primary/90 transition-colors"
                >
                  Subir primer video
                </button>
                <button
                  onClick={() => navigate("/compare")}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-display font-semibold text-foreground hover:bg-secondary transition-colors"
                >
                  Compare
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-12">
              <Video size={32} className="text-muted-foreground" />
              <p className="text-sm font-display font-semibold text-foreground">Sin videos</p>
              <p className="text-xs text-muted-foreground">
                {searchQuery ? "Ningún video coincide con tu búsqueda" : "Sube un video para comenzar el análisis"}
              </p>
              <button
                onClick={() => setShowUpload(true)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold"
              >
                Subir video
              </button>
            </div>
          )}
        </motion.div>

        {/* Right Column: Analysis Videos + Top Stories */}
        <motion.div variants={item} className="space-y-6">
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-bold text-lg text-foreground mb-4">
              Latest Analysis Videos
            </h2>
            <div className="space-y-3">
              {mockAnalysisVideos.map((av) => (
                <div key={av.id} className="flex items-center gap-3 cursor-pointer group">
                  <div className="w-16 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                    <Play size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-medium text-foreground/80 line-clamp-2 leading-tight">
                      {av.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-bold text-lg text-foreground mb-4">
              Top Stories
            </h2>
            <div className="space-y-4">
              {filteredStories.map((story) => (
                <div key={story.id} className="cursor-pointer group">
                  <p className="text-xs font-display text-foreground/70 leading-relaxed line-clamp-2 group-hover:text-foreground/90 transition-colors">
                    {story.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={10} className="text-muted-foreground" />
                    <span className="text-[10px] font-display text-muted-foreground">{story.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="border-t border-border py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-xs font-display text-muted-foreground hover:text-foreground cursor-pointer transition-colors">About Vitas</span>
            <span className="text-xs font-display text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Contact</span>
            <span className="text-xs font-display text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Terms of Service</span>
            <span className="text-xs font-display text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Privacy Policy</span>
          </div>
          <span className="text-xs font-display text-muted-foreground">© 2026 Vitas Analytics. All rights reserved.</span>
        </div>
      </div>
    </motion.div>
  );
};

export default ReportsPage;
