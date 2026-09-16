/**
 * UserGuidePage — /guide
 * Guia de usuario completa de VITAS Football Intelligence.
 * Contenido i18n (namespace `userGuide`, 7 idiomas). Descargable en PDF via
 * window.print() con formato de documento VITAS (igual que los informes).
 */

import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, BookOpen, Download, Users, Video, BarChart3,
  Shield, Gauge, Brain, Activity, Settings, CreditCard,
  UserPlus, Search, TrendingUp, Target,
  ChevronRight, Lightbulb,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PUBLIC_HOST } from "@/lib/publicUrl";

// ── Section helpers ──────────────────────────────────────────────────────────

function Section({ id, icon: Icon, title, children }: {
  id: string; icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center gap-2.5 mb-4 mt-10 first:mt-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 print:bg-gray-100">
          <Icon size={16} className="text-primary print:text-gray-700" />
        </div>
        <h2 className="font-display font-bold text-lg text-foreground print:text-black">{title}</h2>
      </div>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed print:text-gray-700">
        {children}
      </div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">{children}</h3>;
}

function Steps({ items }: { items: Array<{ title: string; desc: string }> }) {
  return (
    <div className="space-y-2">
      {items.map((s, n) => (
        <div key={n} className="flex gap-3 items-start">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold print:bg-gray-200 print:text-gray-800">
            {n + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-foreground print:text-black">{s.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 print:text-gray-600">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 ml-2">
      {items.map((li, i) => <li key={i}>{li}</li>)}
    </ul>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10 print:bg-gray-50 print:border-gray-200">
      <Lightbulb size={14} className="text-primary shrink-0 mt-0.5 print:text-gray-600" />
      <p className="text-xs text-muted-foreground print:text-gray-600">{children}</p>
    </div>
  );
}

// ── Table of contents (ids + iconos fijos; etiquetas desde i18n) ─────────────

const TOC_META: Array<{ id: string; icon: React.ElementType }> = [
  { id: "getting-started", icon: UserPlus },
  { id: "players", icon: Users },
  { id: "metrics", icon: Gauge },
  { id: "video", icon: Video },
  { id: "rankings", icon: BarChart3 },
  { id: "role-profile", icon: Target },
  { id: "phv", icon: Activity },
  { id: "scout-insights", icon: Brain },
  { id: "team", icon: Users },
  { id: "director", icon: TrendingUp },
  { id: "settings", icon: Settings },
  { id: "plans", icon: CreditCard },
  { id: "security", icon: Shield },
  { id: "faq", icon: Search },
];

type NameDesc = { name: string; desc: string };
type QA = { q: string; a: string };

// ── Main page ────────────────────────────────────────────────────────────────

const UserGuidePage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Helpers i18n: escalares y objetos/arrays (returnObjects).
  const g = (k: string) => t(`userGuide.${k}`);
  const arr = <T,>(k: string): T[] => (t(`userGuide.${k}`, { returnObjects: true }) as T[]) ?? [];

  const toc = arr<string>("toc");
  const handleDownload = () => window.print();

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          section { page-break-inside: avoid; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-background text-foreground pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40 no-print"
        >
          <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <BookOpen size={18} className="text-primary" />
            <h1 className="font-display font-bold text-sm uppercase tracking-wider flex-1">{g("navTitle")}</h1>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-colors"
            >
              <Download size={13} />
              {g("download")}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-8"
        >
          {/* Cover — formato documento VITAS (igual que los informes) */}
          <div className="text-center mb-10 pb-8 border-b-2 border-border/30 print:border-gray-200">
            <div className="text-[11px] font-bold tracking-widest uppercase text-primary print:text-purple-600 mb-3">
              {g("kicker")}
            </div>
            <h1 className="font-display font-bold text-3xl text-foreground print:text-black">{g("title")}</h1>
            <p className="text-sm font-display text-muted-foreground mt-2 print:text-gray-500">{g("subtitle")}</p>
            <p className="text-xs text-muted-foreground mt-2 print:text-gray-400">{g("version")}</p>
          </div>

          {/* Table of Contents */}
          <div className="mb-10 p-4 rounded-xl border border-border/30 bg-card print:bg-gray-50 print:border-gray-200">
            <h3 className="font-display font-semibold text-sm text-foreground mb-3 print:text-black">{g("tocTitle")}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {TOC_META.map((item, i) => (
                <a key={item.id} href={`#${item.id}`}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1 print:text-gray-600">
                  <span className="text-[10px] text-muted-foreground w-4 print:text-gray-400">{i + 1}.</span>
                  <item.icon size={11} className="shrink-0" />
                  {toc[i]}
                </a>
              ))}
            </div>
          </div>

          {/* 1. PRIMEROS PASOS */}
          <Section id="getting-started" icon={UserPlus} title={g("gettingStarted.title")}>
            <p>{g("gettingStarted.intro")}</p>
            <SubHeading>{g("gettingStarted.registerHeading")}</SubHeading>
            <Steps items={arr<{ title: string; desc: string }>("gettingStarted.steps")} />
            <Tip>{g("gettingStarted.tip")}</Tip>
          </Section>

          {/* 2. GESTION DE JUGADORES */}
          <Section id="players" icon={Users} title={g("players.title")}>
            <p>{g("players.intro")}</p>
            <SubHeading>{g("players.createHeading")}</SubHeading>
            <Steps items={arr<{ title: string; desc: string }>("players.steps")} />
            <SubHeading>{g("players.profileHeading")}</SubHeading>
            <p>{g("players.profileIntro")}</p>
            <Bullets items={arr<string>("players.profileList")} />
            <Tip>{g("players.tip")}</Tip>
          </Section>

          {/* 3. METRICAS Y VSI */}
          <Section id="metrics" icon={Gauge} title={g("metrics.title")}>
            <p>{g("metrics.intro")}</p>
            <SubHeading>{g("metrics.sixHeading")}</SubHeading>
            <div className="grid grid-cols-2 gap-2">
              {arr<NameDesc>("metrics.metricsList").map((m) => (
                <div key={m.name} className="p-2 rounded-lg bg-secondary/30 print:bg-gray-50">
                  <p className="text-xs font-medium text-foreground print:text-black">{m.name}</p>
                  <p className="text-[10px] text-muted-foreground print:text-gray-500">{m.desc}</p>
                </div>
              ))}
            </div>
            <SubHeading>{g("metrics.calcHeading")}</SubHeading>
            <p>{g("metrics.calcText")}</p>
            <Tip>{g("metrics.tip")}</Tip>
          </Section>

          {/* 4. ANALISIS DE VIDEO */}
          <Section id="video" icon={Video} title={g("video.title")}>
            <p>{g("video.intro")}</p>
            <SubHeading>{g("video.individualHeading")}</SubHeading>
            <Steps items={arr<{ title: string; desc: string }>("video.steps")} />
            <SubHeading>{g("video.teamHeading")}</SubHeading>
            <p>{g("video.teamText")}</p>
            <Tip>{g("video.tip")}</Tip>
          </Section>

          {/* 5. RANKINGS */}
          <Section id="rankings" icon={BarChart3} title={g("rankings.title")}>
            <p>{g("rankings.intro")}</p>
            <Bullets items={arr<string>("rankings.list")} />
            <SubHeading>{g("rankings.compareHeading")}</SubHeading>
            <p>{g("rankings.compareText")}</p>
          </Section>

          {/* 6. ROLE PROFILE */}
          <div className="print-break" />
          <Section id="role-profile" icon={Target} title={g("roleProfile.title")}>
            <p>{g("roleProfile.intro")}</p>
            <SubHeading>{g("roleProfile.includesHeading")}</SubHeading>
            <Bullets items={arr<string>("roleProfile.list")} />
            <Tip>{g("roleProfile.tip")}</Tip>
          </Section>

          {/* 7. PHV */}
          <Section id="phv" icon={Activity} title={g("phv.title")}>
            <p>{g("phv.intro")}</p>
            <SubHeading>{g("phv.categoriesHeading")}</SubHeading>
            <div className="space-y-2">
              {arr<NameDesc>("phv.categories").map((c, i) => (
                <div key={i} className={`p-2 rounded-lg border ${
                  i === 0 ? "bg-orange-500/10 border-orange-500/20 print:bg-orange-50"
                  : i === 1 ? "bg-blue-500/10 border-blue-500/20 print:bg-blue-50"
                  : "bg-green-500/10 border-green-500/20 print:bg-green-50"}`}>
                  <p className="text-xs font-medium text-foreground print:text-black">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">{c.desc}</p>
                </div>
              ))}
            </div>
            <Tip>{g("phv.tip")}</Tip>
          </Section>

          {/* 8. SCOUT INSIGHTS */}
          <Section id="scout-insights" icon={Brain} title={g("scoutInsights.title")}>
            <p>{g("scoutInsights.intro")}</p>
            <SubHeading>{g("scoutInsights.typesHeading")}</SubHeading>
            <Bullets items={arr<string>("scoutInsights.list")} />
            <p>{g("scoutInsights.outro")}</p>
          </Section>

          {/* 9. EQUIPO */}
          <Section id="team" icon={Users} title={g("team.title")}>
            <p>{g("team.intro")}</p>
            <SubHeading>{g("team.rolesHeading")}</SubHeading>
            <div className="space-y-2">
              {arr<NameDesc>("team.roles").map((r) => (
                <div key={r.name} className="flex gap-2 items-start">
                  <Shield size={12} className="text-primary shrink-0 mt-1" />
                  <div>
                    <p className="text-xs font-medium text-foreground print:text-black">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground print:text-gray-500">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <SubHeading>{g("team.inviteHeading")}</SubHeading>
            <p>{g("team.inviteText")}</p>
          </Section>

          {/* 10. DIRECTOR */}
          <div className="print-break" />
          <Section id="director" icon={TrendingUp} title={g("director.title")}>
            <p>{g("director.intro")}</p>
            <SubHeading>{g("director.metricsHeading")}</SubHeading>
            <Bullets items={arr<string>("director.list")} />
          </Section>

          {/* 11. AJUSTES */}
          <Section id="settings" icon={Settings} title={g("settings.title")}>
            <SubHeading>{g("settings.exportHeading")}</SubHeading>
            <Bullets items={arr<string>("settings.exportList")} />
            <SubHeading>{g("settings.notifHeading")}</SubHeading>
            <p>{g("settings.notifText")}</p>
            <SubHeading>{g("settings.deleteHeading")}</SubHeading>
            <p>{g("settings.deleteText")}</p>
          </Section>

          {/* 12. PLANES */}
          <Section id="plans" icon={CreditCard} title={g("plans.title")}>
            <div className="space-y-2">
              {arr<NameDesc>("plans.plans").map((p) => (
                <div key={p.name} className="p-3 rounded-lg border border-border/30 print:border-gray-200">
                  <p className="text-sm font-display font-bold text-foreground print:text-black">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 print:text-gray-500">{p.desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-3">{g("plans.outro")}</p>
          </Section>

          {/* 13. SEGURIDAD */}
          <Section id="security" icon={Shield} title={g("security.title")}>
            <Bullets items={arr<string>("security.list")} />
          </Section>

          {/* 14. FAQ */}
          <div className="print-break" />
          <Section id="faq" icon={Search} title={g("faq.title")}>
            {arr<QA>("faq.items").map((item, i) => (
              <div key={i} className="mb-3">
                <p className="text-xs font-medium text-foreground print:text-black flex items-start gap-1.5">
                  <ChevronRight size={12} className="text-primary shrink-0 mt-0.5" />
                  {item.q}
                </p>
                <p className="text-[11px] text-muted-foreground ml-5 mt-0.5 print:text-gray-600">{item.a}</p>
              </div>
            ))}
          </Section>

          {/* Footer — formato documento VITAS (igual que los informes) */}
          <div className="mt-12 pt-6 border-t border-border/30 print:border-gray-200">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[10px] font-bold tracking-widest uppercase text-primary print:text-purple-600">VITAS.</div>
              <div className="text-[10px] text-muted-foreground print:text-gray-400">{g("subtitle")} &middot; {g("version")}</div>
              <div className="text-[10px] text-muted-foreground print:text-gray-400">&copy; {new Date().getFullYear()}</div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center print:text-gray-400">
              {t("userGuide.supportLine", { host: PUBLIC_HOST })}
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default UserGuidePage;
