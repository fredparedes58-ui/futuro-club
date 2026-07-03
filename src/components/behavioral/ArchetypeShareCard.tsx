/**
 * VITAS · ArchetypeShareCard (Sprint 3.6 💎 ADN Mental)
 *
 * Card compartible del arquetipo mental del jugador (estilo test-de-personalidad).
 * Efecto identificación emocional → el padre/jugador la comparte en el WhatsApp
 * del equipo = adquisición orgánica. Export a PNG con marca de agua VITAS.
 */
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Share2, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ARCHETYPE_META, type Archetype } from "@/lib/behavioral/archetypeMeta";
import { shareToWhatsApp, shareNative } from "@/lib/share";

export interface ArchetypeShareDimensions {
  decisionSpeed: number;
  scanningIntelligence: number;
  resilience: number;
  clutchFactor: number;
  leadership: number;
  mentalFatigue: number;
  unpredictability: number;
}

interface Props {
  playerName: string;
  position?: string;
  age?: number;
  archetype: Archetype;
  mentalComposite: number;
  dimensions: ArchetypeShareDimensions;
  confidence?: number; // 0-1
}

const DIM_LABELS: Record<keyof ArchetypeShareDimensions, string> = {
  decisionSpeed: "Decisión",
  scanningIntelligence: "Scan IQ",
  resilience: "Resiliencia",
  clutchFactor: "Clutch",
  leadership: "Liderazgo",
  mentalFatigue: "Resistencia mental",
  unpredictability: "Creatividad",
};

export function ArchetypeShareCard({
  playerName,
  position,
  age,
  archetype,
  mentalComposite,
  dimensions,
  confidence,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const m = ARCHETYPE_META[archetype] ?? ARCHETYPE_META.engine;

  const top3 = (Object.keys(dimensions) as Array<keyof ArchetypeShareDimensions>)
    .map((k) => ({ label: DIM_LABELS[k], value: dimensions[k] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const handleExport = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 3,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `VITAS_ADN_${playerName.replace(/\s+/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("ADN Mental exportado");
    } catch {
      toast.error("Error al exportar — intenta con captura de pantalla");
    } finally {
      setExporting(false);
    }
  };

  const shareText = `${m.emoji} ${playerName} es un ${m.label} — "${m.tagline}" · ADN Mental ${mentalComposite}/100 · descúbrelo con VITAS`;

  const handleShare = async () => {
    const r = await shareNative({ title: "ADN Mental · VITAS", text: shareText, ref: "archetype-card" });
    if (r === "copied") toast.success("Texto + enlace copiados");
    else if (r === "failed") toast.error("No se pudo compartir");
  };

  const handleWhatsApp = () => shareToWhatsApp(shareText, "archetype-card");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-2 flex-1" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          PNG
        </Button>
        <Button variant="outline" size="sm" className="gap-2 flex-1" onClick={handleWhatsApp}>
          <MessageCircle size={14} className="text-emerald-500" /> WhatsApp
        </Button>
        <Button variant="outline" size="sm" className="gap-2 flex-1" onClick={handleShare}>
          <Share2 size={14} /> Compartir
        </Button>
      </div>

      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative rounded-2xl overflow-hidden select-none"
        style={{
          background: "linear-gradient(135deg, #0f0f1a 0%, #16162a 55%, #0d0d1f 100%)",
          border: `1px solid ${m.color}55`,
          minHeight: 380,
        }}
      >
        {/* Glow del color del arquetipo */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-10 -right-10 w-56 h-56 rounded-full"
            style={{ background: `radial-gradient(circle, ${m.color}, transparent 70%)`, opacity: 0.18 }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/5">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: m.color }}>
            VITAS · ADN Mental
          </span>
          <span className="text-[9px] text-white/30 font-mono">
            {new Date().toLocaleDateString("es-ES")}
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* Identidad */}
          <div>
            <span className="text-[9px] font-bold tracking-[0.15em] text-white/40 uppercase">
              {[position, age ? `${age} años` : null].filter(Boolean).join(" · ")}
            </span>
            <h2 className="text-2xl font-black text-white tracking-tight leading-tight">{playerName}</h2>
          </div>

          {/* Arquetipo hero */}
          <div className="flex items-center gap-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shrink-0"
              style={{ background: `${m.color}1f`, border: `2px solid ${m.color}55` }}
            >
              {m.emoji}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: m.color }}>
                Arquetipo
              </div>
              <div className="text-3xl font-black text-white leading-none">{m.label}</div>
              <p className="text-[11px] text-white/60 mt-1 leading-snug">"{m.tagline}"</p>
            </div>
          </div>

          {/* Composite + descripción */}
          <div className="flex items-end gap-4">
            <div>
              <p className="text-[9px] font-bold tracking-widest text-white/40 uppercase mb-0.5">ADN Mental</p>
              <div className="text-5xl font-black leading-none" style={{ color: m.color }}>
                {mentalComposite}
              </div>
            </div>
            <p className="text-[11px] text-white/55 leading-snug flex-1 pb-1">{m.description}</p>
          </div>

          {/* Top 3 fortalezas mentales */}
          <div>
            <p className="text-[9px] font-bold tracking-widest text-white/40 uppercase mb-2">Fortalezas mentales</p>
            <div className="space-y-1.5">
              {top3.map((d) => (
                <div key={d.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-white/50 w-28 shrink-0">{d.label}</span>
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${d.value}%`, background: m.color }} />
                  </div>
                  <span className="text-[10px] font-mono text-white/70 w-6 text-right">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer / marca de agua */}
        <div className="px-5 pb-4 flex items-center justify-between">
          <span className="text-[8px] font-mono text-white/25">
            {confidence != null ? `Confianza ${Math.round(confidence * 100)}%` : "VITAS"}
          </span>
          <span className="text-[9px] font-mono font-bold" style={{ color: m.color }}>
            ⚡ Descubre el tuyo → futuro-club.vercel.app
          </span>
        </div>
      </motion.div>
    </div>
  );
}
