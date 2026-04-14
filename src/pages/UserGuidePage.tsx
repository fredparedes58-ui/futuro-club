/**
 * UserGuidePage — /guide
 * Guia de usuario completa de VITAS Football Intelligence.
 * Incluye boton de descarga PDF via window.print().
 */

import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, BookOpen, Download, Users, Video, BarChart3,
  Shield, Gauge, Brain, Activity, Settings, CreditCard,
  UserPlus, Search, TrendingUp, Zap, Target, Eye,
  ChevronRight, Lightbulb, AlertTriangle, CheckCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

// ── Section component ────────────────────────────────────────────────────────

function Section({ id, icon: Icon, title, children }: {
  id: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
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

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold print:bg-gray-200 print:text-gray-800">
        {n}
      </span>
      <div>
        <p className="text-sm font-medium text-foreground print:text-black">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 print:text-gray-600">{desc}</p>
      </div>
    </div>
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

// ── Table of contents ────────────────────────────────────────────────────────

const TOC = [
  { id: "getting-started", label: "Primeros pasos", icon: UserPlus },
  { id: "players", label: "Gestion de jugadores", icon: Users },
  { id: "metrics", label: "Metricas y VSI", icon: Gauge },
  { id: "video", label: "Analisis de video", icon: Video },
  { id: "rankings", label: "Rankings y comparaciones", icon: BarChart3 },
  { id: "role-profile", label: "Perfil tactico (Role Profile)", icon: Target },
  { id: "phv", label: "PHV y maduracion biologica", icon: Activity },
  { id: "scout-insights", label: "Scout Insights (IA)", icon: Brain },
  { id: "team", label: "Equipo y colaboracion", icon: Users },
  { id: "director", label: "Director Dashboard", icon: TrendingUp },
  { id: "settings", label: "Ajustes y datos", icon: Settings },
  { id: "plans", label: "Planes y facturacion", icon: CreditCard },
  { id: "security", label: "Seguridad y privacidad", icon: Shield },
  { id: "faq", label: "Preguntas frecuentes", icon: Search },
];

// ── Main page ────────────────────────────────────────────────────────────────

const UserGuidePage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleDownload = () => {
    window.print();
  };

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
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <BookOpen size={18} className="text-primary" />
            <h1 className="font-display font-bold text-sm uppercase tracking-wider flex-1">
              Guia de Usuario
            </h1>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-colors"
            >
              <Download size={13} />
              Descargar PDF
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-3xl mx-auto px-4 py-8"
        >
          {/* Cover */}
          <div className="text-center mb-10 pb-8 border-b border-border/30 print:border-gray-200">
            <h1 className="font-display font-bold text-3xl text-foreground print:text-black">
              VITAS<span className="text-primary print:text-gray-500">.</span>
            </h1>
            <p className="text-lg font-display text-muted-foreground mt-1 print:text-gray-500">
              Football Intelligence
            </p>
            <p className="text-2xl font-display font-bold text-foreground mt-4 print:text-black">
              Guia de Usuario
            </p>
            <p className="text-xs text-muted-foreground mt-2 print:text-gray-400">
              Version 1.0 &middot; Abril 2026
            </p>
          </div>

          {/* Table of Contents */}
          <div className="mb-10 p-4 rounded-xl border border-border/30 bg-card print:bg-gray-50 print:border-gray-200">
            <h3 className="font-display font-semibold text-sm text-foreground mb-3 print:text-black">Contenido</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {TOC.map((item, i) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1 print:text-gray-600"
                >
                  <span className="text-[10px] text-muted-foreground w-4 print:text-gray-400">{i + 1}.</span>
                  <item.icon size={11} className="shrink-0" />
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          {/* ── 1. PRIMEROS PASOS ─────────────────────────────────────── */}
          <Section id="getting-started" icon={UserPlus} title="1. Primeros pasos">
            <p>
              VITAS es una plataforma de inteligencia deportiva para futbol juvenil. Permite a scouts,
              entrenadores y directores deportivos evaluar jugadores con metricas objetivas, analisis de
              video con IA, y reportes profesionales.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Registro</h3>
            <div className="space-y-2">
              <Step n={1} title="Crear cuenta" desc="Ve a la pantalla de registro e ingresa tu email y contrasena. Tambien puedes usar Google." />
              <Step n={2} title="Verificar email" desc="Revisa tu bandeja de entrada y haz clic en el enlace de verificacion." />
              <Step n={3} title="Completar onboarding" desc="Selecciona tu tipo de perfil (Scout, Padre, Academia, Club), nombre de organizacion, y preferencias." />
              <Step n={4} title="Datos de inicio" desc="Puedes comenzar con jugadores demo para explorar la plataforma, o agregar tus propios jugadores de inmediato." />
            </div>

            <Tip>
              Si eres director de una academia, selecciona "Academia" o "Club" como tipo de perfil para
              desbloquear las funciones de equipo y multi-usuario.
            </Tip>
          </Section>

          {/* ── 2. GESTION DE JUGADORES ───────────────────────────────── */}
          <Section id="players" icon={Users} title="2. Gestion de jugadores">
            <p>
              Los jugadores son el nucleo de VITAS. Cada jugador tiene un perfil completo con datos
              personales, metricas de rendimiento, historial de analisis, y su score VSI.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Crear un jugador</h3>
            <div className="space-y-2">
              <Step n={1} title="Ir a Rankings" desc="Toca el boton '+' o 'Nuevo jugador' en la esquina superior." />
              <Step n={2} title="Datos basicos" desc="Nombre, fecha de nacimiento, posicion, pie dominante, altura y peso." />
              <Step n={3} title="Metricas iniciales" desc="Evalua velocidad, tecnica, vision, disparo, defensa y resistencia (escala 1-100)." />
              <Step n={4} title="Guardar" desc="El jugador aparece inmediatamente en Rankings con su VSI calculado." />
            </div>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Perfil del jugador</h3>
            <p>
              Al tocar un jugador en Rankings, accedes a su perfil completo donde puedes ver:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Score VSI con tendencia (subiendo, estable, bajando)</li>
              <li>Radar de metricas con 6 dimensiones</li>
              <li>Categoria PHV (maduracion biologica)</li>
              <li>Historial de analisis de video</li>
              <li>Role Profile (perfil tactico)</li>
              <li>Comparativa con jugadores profesionales similares</li>
            </ul>

            <Tip>
              Los datos se sincronizan automaticamente con el servidor. Si pierdes conexion, VITAS
              guarda los cambios localmente y los sube cuando vuelvas a tener internet.
            </Tip>
          </Section>

          {/* ── 3. METRICAS Y VSI ─────────────────────────────────────── */}
          <Section id="metrics" icon={Gauge} title="3. Metricas y VSI">
            <p>
              El <strong className="text-foreground print:text-black">VSI (VITAS Scouting Index)</strong> es el score
              principal de cada jugador. Va de 0 a 100 y combina todas las metricas con pesos ajustados por posicion.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Las 6 metricas base</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Velocidad", "Rapidez y aceleracion en campo"],
                ["Tecnica", "Control de balon, regate, primer toque"],
                ["Vision", "Lectura de juego, pases creativos"],
                ["Disparo", "Precision y potencia de remate"],
                ["Defensa", "Anticipacion, tackles, posicionamiento"],
                ["Resistencia", "Capacidad aerobica y recuperacion"],
              ].map(([name, desc]) => (
                <div key={name} className="p-2 rounded-lg bg-secondary/30 print:bg-gray-50">
                  <p className="text-xs font-medium text-foreground print:text-black">{name}</p>
                  <p className="text-[10px] text-muted-foreground print:text-gray-500">{desc}</p>
                </div>
              ))}
            </div>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Como se calcula el VSI</h3>
            <p>
              El VSI pondera las metricas segun la posicion del jugador. Un delantero centro pesa mas
              en Disparo y Velocidad, mientras un mediocentro pesa mas en Vision y Tecnica. El
              algoritmo tambien ajusta por categoria PHV para no penalizar a jugadores de maduracion tardia.
            </p>

            <Tip>
              Un VSI por encima de 75 se considera destacado para su edad. Por encima de 85, el jugador
              esta en el top percentil de su categoria.
            </Tip>
          </Section>

          {/* ── 4. ANALISIS DE VIDEO ──────────────────────────────────── */}
          <Section id="video" icon={Video} title="4. Analisis de video con IA">
            <p>
              VITAS analiza videos de partidos usando dos modelos de IA: <strong className="text-foreground print:text-black">Google Gemini</strong> observa
              el video completo, y <strong className="text-foreground print:text-black">Claude</strong> genera el informe tactico estructurado.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Analisis individual (Video Intelligence)</h3>
            <div className="space-y-2">
              <Step n={1} title="Ir al perfil del jugador" desc="Toca el jugador en Rankings y selecciona 'Analisis de Video'." />
              <Step n={2} title="Subir video" desc="Arrastra o selecciona un video MP4 del partido. VITAS lo sube a la nube automaticamente." />
              <Step n={3} title="Configurar contexto" desc="Color del uniforme, posicion del jugador, nivel competitivo. Opcionalmente, enfoque de analisis." />
              <Step n={4} title="Ejecutar analisis" desc="La IA procesa el video (1-3 minutos). Veras progreso en tiempo real." />
              <Step n={5} title="Revisar informe" desc="Informe completo: resumen ejecutivo, KPIs, fortalezas, areas a mejorar, recomendaciones." />
            </div>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Analisis de equipo (Team Intelligence)</h3>
            <p>
              Funciona igual pero evalua al equipo completo: formacion, fases de juego, metricas
              colectivas (compacidad, sincronizacion, pressing), y rendimiento por jugador.
            </p>

            <Tip>
              Los videos se almacenan de forma segura en Bunny CDN. Puedes reanalizarlos con diferentes
              enfoques (ofensivo, defensivo, transiciones) sin volver a subirlos.
            </Tip>
          </Section>

          {/* ── 5. RANKINGS ───────────────────────────────────────────── */}
          <Section id="rankings" icon={BarChart3} title="5. Rankings y comparaciones">
            <p>
              La vista de Rankings muestra todos tus jugadores ordenados por VSI. Funcionalidades:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-foreground print:text-black">Buscar</strong> — Filtra por nombre en tiempo real</li>
              <li><strong className="text-foreground print:text-black">Ordenar</strong> — Por VSI, edad, o nombre</li>
              <li><strong className="text-foreground print:text-black">Podio</strong> — Los 3 mejores jugadores destacados visualmente</li>
              <li><strong className="text-foreground print:text-black">Filtrar por grupo</strong> — Sub-14, Sub-16, Sub-18, Sub-21</li>
            </ul>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Comparar jugadores</h3>
            <p>
              Desde el menu principal, accede a "Comparar" para seleccionar 2 jugadores y ver sus
              radares de metricas superpuestos, diferencias por dimension, y recomendacion de la IA
              sobre cual tiene mas proyeccion.
            </p>
          </Section>

          {/* ── 6. ROLE PROFILE ───────────────────────────────────────── */}
          <div className="print-break" />
          <Section id="role-profile" icon={Target} title="6. Perfil tactico (Role Profile)">
            <p>
              El Role Profile es un analisis generado por IA que determina el <strong className="text-foreground print:text-black">arquetipo tactico</strong> del
              jugador (ej: "Regateador", "Organizador", "Box-to-Box") basado en sus metricas.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Que incluye</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-foreground print:text-black">Posicion optima</strong> — Donde rinde mejor segun sus numeros</li>
              <li><strong className="text-foreground print:text-black">Arquetipo</strong> — Estilo de juego dominante</li>
              <li><strong className="text-foreground print:text-black">Identidad</strong> — Distribucion: fisico, tecnico, ofensivo, defensivo, mixto</li>
              <li><strong className="text-foreground print:text-black">Proyeccion</strong> — Estimacion a 6 y 18 meses ajustada por PHV</li>
              <li><strong className="text-foreground print:text-black">Resumen</strong> — Texto generado por IA con analisis del perfil</li>
            </ul>

            <Tip>
              El Role Profile se recalcula cada vez que actualizas las metricas del jugador.
              Puedes comparar roles entre jugadores y ver el historial de cambios.
            </Tip>
          </Section>

          {/* ── 7. PHV ────────────────────────────────────────────────── */}
          <Section id="phv" icon={Activity} title="7. PHV y maduracion biologica">
            <p>
              El <strong className="text-foreground print:text-black">PHV (Peak Height Velocity)</strong> mide en que punto de su desarrollo
              biologico esta un jugador juvenil. Es crucial para no comparar injustamente a un chico
              de maduracion temprana con uno de maduracion tardia.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Categorias PHV</h3>
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 print:bg-orange-50">
                <p className="text-xs font-medium text-foreground print:text-black">Early (Pre-PHV)</p>
                <p className="text-[10px] text-muted-foreground">Aun no alcanzo su pico de crecimiento. Puede parecer "mas lento" pero tiene margen de mejora fisica enorme. El VSI se ajusta x1.12 para compensar.</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 print:bg-blue-50">
                <p className="text-xs font-medium text-foreground print:text-black">On-time (Durante PHV)</p>
                <p className="text-[10px] text-muted-foreground">En pleno pico de crecimiento. Ventana critica de desarrollo — las decisiones de entrenamiento aqui son las mas importantes. VSI sin ajuste.</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 print:bg-green-50">
                <p className="text-xs font-medium text-foreground print:text-black">Late (Post-PHV)</p>
                <p className="text-[10px] text-muted-foreground">Ya paso su pico. Rendimiento fisico mas estable, pero puede estar "inflado" vs peers. VSI se ajusta x0.92.</p>
              </div>
            </div>

            <Tip>
              VITAS calcula el PHV usando la formula Mirwald, el estandar en ciencia del deporte juvenil.
              Si proporcionas talla sentado y longitud de piernas, la precision es del 92%.
            </Tip>
          </Section>

          {/* ── 8. SCOUT INSIGHTS ─────────────────────────────────────── */}
          <Section id="scout-insights" icon={Brain} title="8. Scout Insights (IA)">
            <p>
              Los Scout Insights son alertas inteligentes generadas automaticamente por la IA de VITAS.
              Detectan patrones en los datos de tus jugadores y generan recomendaciones accionables.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Tipos de insight</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-foreground print:text-black">Breakout</strong> — Jugador con VSI alto y tendencia al alza</li>
              <li><strong className="text-foreground print:text-black">PHV Alert</strong> — Ventana critica de desarrollo detectada</li>
              <li><strong className="text-foreground print:text-black">Drill Record</strong> — Metrica excepcional alcanzada</li>
              <li><strong className="text-foreground print:text-black">Regression</strong> — Caida significativa de rendimiento</li>
              <li><strong className="text-foreground print:text-black">Milestone</strong> — Hito importante cruzado (VSI 80, 90...)</li>
            </ul>
            <p>
              Cada insight incluye un headline, cuerpo con dato numerico, drills recomendados de la
              biblioteca VITAS, y acciones concretas para el entrenador.
            </p>
          </Section>

          {/* ── 9. EQUIPO ─────────────────────────────────────────────── */}
          <Section id="team" icon={Users} title="9. Equipo y colaboracion">
            <p>
              VITAS permite trabajar en equipo. El director deportivo puede invitar scouts, entrenadores
              y observadores a la organizacion.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Roles disponibles</h3>
            <div className="space-y-2">
              {[
                ["Director", "Acceso total: crear, editar, eliminar jugadores, gestionar equipo, analytics"],
                ["Scout", "Crear y editar jugadores, ejecutar analisis, ver todo, exportar PDF"],
                ["Coach", "Crear y editar sus jugadores, ejecutar analisis, ver video"],
                ["Viewer", "Solo lectura: ver jugadores y rankings, sin modificar datos"],
              ].map(([role, desc]) => (
                <div key={role} className="flex gap-2 items-start">
                  <Shield size={12} className="text-primary shrink-0 mt-1" />
                  <div>
                    <p className="text-xs font-medium text-foreground print:text-black">{role}</p>
                    <p className="text-[10px] text-muted-foreground print:text-gray-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Invitar miembros</h3>
            <p>
              Desde la seccion "Equipo", el director puede enviar invitaciones por email. El invitado
              recibe un enlace para unirse con el rol asignado.
            </p>
          </Section>

          {/* ── 10. DIRECTOR DASHBOARD ────────────────────────────────── */}
          <div className="print-break" />
          <Section id="director" icon={TrendingUp} title="10. Director Dashboard">
            <p>
              Panel exclusivo para directores deportivos con metricas de negocio y uso de la plataforma.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Metricas disponibles</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Jugadores activos y uso del plan</li>
              <li>Analisis IA realizados este mes vs anterior</li>
              <li>Desglose de uso por agente (Scout Insight, Video, Team, etc.)</li>
              <li>Composicion del equipo por rol</li>
              <li>Jugadores mas activos (por visitas y eventos)</li>
              <li>Alertas: limites de plan, inactividad, etc.</li>
              <li>Estado de suscripcion y fecha de renovacion</li>
            </ul>
          </Section>

          {/* ── 11. AJUSTES ───────────────────────────────────────────── */}
          <Section id="settings" icon={Settings} title="11. Ajustes y datos">
            <h3 className="font-display font-semibold text-foreground print:text-black">Exportar datos</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-foreground print:text-black">Backup local</strong> — Descarga tus datos de localStorage como JSON</li>
              <li><strong className="text-foreground print:text-black">Export GDPR completo</strong> — Descarga TODOS tus datos (servidor + local) en un solo archivo</li>
              <li><strong className="text-foreground print:text-black">Importar backup</strong> — Restaura datos desde un archivo JSON previo</li>
            </ul>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Notificaciones</h3>
            <p>
              Configura que notificaciones push quieres recibir: rendimiento bajo, inactividad,
              limites de plan, analisis completados, scout insights, y actualizaciones de equipo.
            </p>

            <h3 className="font-display font-semibold text-foreground mt-4 print:text-black">Eliminar cuenta</h3>
            <p>
              En la zona de peligro puedes eliminar permanentemente tu cuenta y todos tus datos.
              Se te pedira escribir "ELIMINAR" para confirmar. Esta accion es irreversible.
            </p>
          </Section>

          {/* ── 12. PLANES ────────────────────────────────────────────── */}
          <Section id="plans" icon={CreditCard} title="12. Planes y facturacion">
            <div className="space-y-2">
              {[
                ["Free", "3 analisis IA/mes, 5 jugadores, funciones basicas"],
                ["Pro", "20 analisis IA/mes, 25 jugadores, PDF export, VAEP, push notifications"],
                ["Club", "Analisis ilimitados, jugadores ilimitados, roles multi-usuario, soporte prioritario"],
              ].map(([plan, desc]) => (
                <div key={plan} className="p-3 rounded-lg border border-border/30 print:border-gray-200">
                  <p className="text-sm font-display font-bold text-foreground print:text-black">{plan}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 print:text-gray-500">{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-3">
              Puedes cambiar de plan en cualquier momento desde Ajustes &gt; Facturacion. Los pagos se
              procesan de forma segura con Stripe.
            </p>
          </Section>

          {/* ── 13. SEGURIDAD ─────────────────────────────────────────── */}
          <Section id="security" icon={Shield} title="13. Seguridad y privacidad">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Autenticacion JWT con renovacion automatica de tokens</li>
              <li>Datos encriptados en transito (HTTPS) y en reposo (Supabase)</li>
              <li>Rate limiting en todos los endpoints de la API</li>
              <li>Row Level Security (RLS) — cada usuario solo ve sus propios datos</li>
              <li>Cumplimiento GDPR: exportacion de datos, derecho al olvido, consentimiento explicito</li>
              <li>Datos de menores protegidos con politica especifica (Seccion 10 de Privacidad)</li>
              <li>Los videos se almacenan en CDN seguro (Bunny) con acceso autenticado</li>
              <li>La IA NO entrena con tus datos — son procesados y descartados</li>
            </ul>
          </Section>

          {/* ── 14. FAQ ───────────────────────────────────────────────── */}
          <div className="print-break" />
          <Section id="faq" icon={Search} title="14. Preguntas frecuentes">
            {[
              ["Funciona sin internet?", "Si. VITAS es una PWA que funciona offline. Los datos se sincronizan automaticamente cuando recuperas conexion."],
              ["Puedo instalar la app?", "Si. En Chrome, toca 'Instalar' en la barra de direcciones o en el menu. Funciona como app nativa en movil y escritorio."],
              ["Que pasa si supero mi limite de analisis?", "Los analisis IA se bloquean hasta el proximo mes. Puedes subir de plan en cualquier momento para desbloquear mas."],
              ["Mis datos son privados?", "Totalmente. Cada usuario solo ve sus propios datos gracias a RLS. Los datos de tu organizacion estan aislados de otras."],
              ["Puedo exportar un reporte de jugador?", "Si. Desde el perfil del jugador, toca 'Exportar PDF' para generar un informe profesional imprimible."],
              ["Como funciona el analisis de video?", "Gemini observa el video completo y extrae datos brutos. Claude interpreta esos datos y genera un informe tactico estructurado con KPIs y recomendaciones."],
              ["Que es el VSI?", "El VITAS Scouting Index es un score de 0-100 que combina las 6 metricas base ponderadas por posicion y ajustadas por maduracion biologica."],
              ["Puedo tener multiples organizaciones?", "Actualmente cada usuario pertenece a una organizacion. Si necesitas gestionar multiples clubes, contacta soporte."],
            ].map(([q, a]) => (
              <div key={q} className="mb-3">
                <p className="text-xs font-medium text-foreground print:text-black flex items-start gap-1.5">
                  <ChevronRight size={12} className="text-primary shrink-0 mt-0.5" />
                  {q}
                </p>
                <p className="text-[11px] text-muted-foreground ml-5 mt-0.5 print:text-gray-600">{a}</p>
              </div>
            ))}
          </Section>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-border/30 text-center print:border-gray-200">
            <p className="text-xs text-muted-foreground print:text-gray-400">
              VITAS Football Intelligence &middot; Version 1.0 &middot; Abril 2026
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 print:text-gray-400">
              Para soporte: contacto desde la seccion de Ajustes o en futuro-club.vercel.app
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default UserGuidePage;
