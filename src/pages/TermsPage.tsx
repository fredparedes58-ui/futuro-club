import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Shield } from "lucide-react";

const LAST_UPDATED = "12 de abril de 2026";

const TermsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40"
      >
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <FileText size={18} className="text-primary" />
          <h1 className="font-display font-bold text-sm uppercase tracking-wider">
            Términos de Servicio
          </h1>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-3xl mx-auto px-4 py-8"
      >
        <div className="prose prose-sm prose-invert max-w-none
          prose-headings:font-display prose-headings:tracking-tight
          prose-h2:text-lg prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-foreground
          prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-foreground/90
          prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-sm
          prose-li:text-muted-foreground prose-li:text-sm
          prose-strong:text-foreground prose-strong:font-semibold
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-primary" />
            <p className="text-xs text-muted-foreground/60 !mt-0">
              Última actualización: {LAST_UPDATED}
            </p>
          </div>

          <p>
            Bienvenido a <strong>VITAS</strong>. Estos Términos de Servicio ("Términos") regulan
            el acceso y uso de la plataforma VITAS, disponible en{" "}
            <a href="https://futuro-club.vercel.app" target="_blank" rel="noopener noreferrer">
              futuro-club.vercel.app
            </a>{" "}
            y sus aplicaciones asociadas. Al registrarte o utilizar nuestros servicios, aceptas
            quedar vinculado por estos Términos.
          </p>

          <h2>1. Aceptación de los Términos</h2>
          <p>
            Al crear una cuenta, acceder o utilizar cualquier funcionalidad de VITAS, confirmas que
            has leído, comprendido y aceptado estos Términos en su totalidad. Si no estás de acuerdo
            con alguna disposición, debes abstenerte de usar la plataforma.
          </p>
          <p>
            Si utilizas VITAS en representación de una organización (club, academia, etc.), declaras
            que tienes autorización para vincular a dicha entidad a estos Términos.
          </p>

          <h2>2. Descripción del Servicio</h2>
          <p>
            VITAS es una plataforma de inteligencia deportiva enfocada en el fútbol que ofrece:
          </p>
          <ul>
            <li>Scouting y evaluación de jugadores juveniles.</li>
            <li>Análisis de video con procesamiento mediante inteligencia artificial.</li>
            <li>Métricas de rendimiento, rankings y comparativas de jugadores.</li>
            <li>Informes automatizados y reportes de evolución.</li>
            <li>Herramientas colaborativas para equipos técnicos y directores deportivos.</li>
            <li>Notificaciones push y alertas personalizadas.</li>
          </ul>
          <p>
            Nos reservamos el derecho de modificar, suspender o discontinuar cualquier funcionalidad
            del servicio en cualquier momento, con notificación previa razonable cuando sea posible.
          </p>

          <h2>3. Cuentas de Usuario</h2>
          <h3>3.1 Registro</h3>
          <p>
            Para usar VITAS necesitas crear una cuenta proporcionando información veraz y actualizada.
            Eres responsable de mantener la confidencialidad de tus credenciales de acceso.
          </p>
          <h3>3.2 Responsabilidades del Usuario</h3>
          <ul>
            <li>Proporcionar información precisa y mantenerla actualizada.</li>
            <li>Proteger las credenciales de acceso a tu cuenta.</li>
            <li>Notificarnos inmediatamente ante cualquier uso no autorizado.</li>
            <li>No compartir tu cuenta con terceros no autorizados.</li>
            <li>Cumplir con toda la legislación aplicable al utilizar la plataforma.</li>
          </ul>
          <h3>3.3 Roles y Permisos</h3>
          <p>
            VITAS ofrece diferentes roles (entrenador, director deportivo, scout, etc.) con distintos
            niveles de acceso. El administrador de cada organización es responsable de gestionar los
            roles y permisos de sus miembros.
          </p>

          <h2>4. Planes de Suscripción y Facturación</h2>
          <h3>4.1 Planes</h3>
          <p>
            VITAS ofrece distintos planes de suscripción con funcionalidades y límites diferenciados.
            Los detalles de cada plan, incluyendo precios y características, están disponibles en la
            sección de facturación de la plataforma.
          </p>
          <h3>4.2 Procesamiento de Pagos</h3>
          <p>
            Los pagos se procesan a través de <strong>Stripe</strong>, un proveedor de pagos externo
            certificado PCI DSS. VITAS no almacena directamente datos de tarjetas de crédito ni
            información financiera sensible.
          </p>
          <h3>4.3 Renovación y Cancelación</h3>
          <p>
            Las suscripciones se renuevan automáticamente al final de cada período de facturación.
            Puedes cancelar tu suscripción en cualquier momento desde la configuración de tu cuenta.
            La cancelación será efectiva al final del período de facturación en curso.
          </p>
          <h3>4.4 Reembolsos</h3>
          <p>
            Los reembolsos se gestionan caso por caso. Para solicitar un reembolso, contacta a
            nuestro equipo de soporte en{" "}
            <a href="mailto:soporte@vitas.app">soporte@vitas.app</a>.
          </p>

          <h2>5. Propiedad Intelectual</h2>
          <h3>5.1 Propiedad de VITAS</h3>
          <p>
            La plataforma VITAS, incluyendo su código fuente, diseño, algoritmos de análisis,
            modelos de inteligencia artificial, marca, logotipos y documentación, son propiedad
            exclusiva de VITAS o sus licenciantes. Queda prohibida la reproducción, distribución o
            ingeniería inversa de cualquier componente de la plataforma.
          </p>
          <h3>5.2 Propiedad del Usuario</h3>
          <p>
            Los datos que ingresas en la plataforma (información de jugadores, videos, estadísticas,
            notas de scouting) son y permanecen de tu propiedad. VITAS no reclama derechos de
            propiedad sobre tu contenido.
          </p>
          <h3>5.3 Licencia de Uso</h3>
          <p>
            Al subir contenido a VITAS, nos otorgas una licencia limitada, no exclusiva y revocable
            para procesar, almacenar y mostrar dicho contenido únicamente con el fin de prestarte
            el servicio contratado.
          </p>

          <h2>6. Contenido Generado por el Usuario</h2>
          <p>
            Los usuarios pueden subir videos, crear análisis, generar informes y compartir contenido
            dentro de la plataforma. Al hacerlo, declaras que:
          </p>
          <ul>
            <li>Tienes los derechos necesarios sobre el contenido que subes.</li>
            <li>
              El contenido no infringe derechos de terceros ni legislación aplicable.
            </li>
            <li>
              Has obtenido los consentimientos necesarios, especialmente cuando el contenido incluye
              datos de menores de edad.
            </li>
          </ul>

          <h2>7. Contenido Generado por Inteligencia Artificial</h2>
          <p>
            VITAS utiliza modelos de inteligencia artificial para generar análisis, recomendaciones,
            perfiles de rol, comparativas y otros insights deportivos. Es importante que comprendas
            lo siguiente:
          </p>
          <ul>
            <li>
              Los análisis e insights generados por IA son <strong>orientativos y de carácter
              informativo</strong>. No constituyen asesoramiento profesional médico, deportivo ni
              de ningún otro tipo.
            </li>
            <li>
              Las predicciones y proyecciones (como estimaciones de PHV o potencial de desarrollo)
              son aproximaciones estadísticas y no garantías.
            </li>
            <li>
              Las decisiones deportivas basadas en estos análisis son responsabilidad exclusiva del
              usuario o la organización que las adopte.
            </li>
            <li>
              VITAS no garantiza la exactitud, integridad ni idoneidad de los resultados generados
              por IA para ningún propósito particular.
            </li>
          </ul>

          <h2>8. Procesamiento de Datos y Servicios de Terceros</h2>
          <p>
            Para prestar el servicio, VITAS utiliza los siguientes proveedores y servicios externos:
          </p>
          <ul>
            <li><strong>Supabase</strong> — Base de datos, autenticación y almacenamiento.</li>
            <li><strong>Stripe</strong> — Procesamiento de pagos y gestión de suscripciones.</li>
            <li><strong>Bunny CDN</strong> — Almacenamiento y distribución de contenido de video.</li>
            <li><strong>Anthropic (Claude) y Google (Gemini)</strong> — Análisis mediante inteligencia artificial.</li>
            <li><strong>Vercel</strong> — Hosting y despliegue de la aplicación.</li>
            <li><strong>Resend</strong> — Envío de correos electrónicos transaccionales.</li>
            <li><strong>Upstash</strong> — Servicios de caché y rate limiting.</li>
          </ul>
          <p>
            El uso de estos servicios está sujeto a sus respectivos términos y políticas de
            privacidad. Consulta nuestra{" "}
            <a href="/privacy" onClick={(e) => { e.preventDefault(); navigate("/privacy"); }}>
              Política de Privacidad
            </a>{" "}
            para más detalles sobre cómo se procesan tus datos.
          </p>

          <h2>9. Limitación de Responsabilidad</h2>
          <p>
            En la máxima medida permitida por la ley aplicable:
          </p>
          <ul>
            <li>
              VITAS se proporciona "tal cual" y "según disponibilidad", sin garantías de ningún
              tipo, expresas o implícitas.
            </li>
            <li>
              No garantizamos que el servicio sea ininterrumpido, libre de errores ni compatible
              con todos los dispositivos.
            </li>
            <li>
              VITAS no será responsable de daños indirectos, incidentales, especiales, consecuentes
              o punitivos derivados del uso o imposibilidad de uso de la plataforma.
            </li>
            <li>
              Nuestra responsabilidad total acumulada no excederá el monto pagado por el usuario
              en los doce (12) meses anteriores al evento que originó la reclamación.
            </li>
          </ul>

          <h2>10. Uso Prohibido</h2>
          <p>Queda prohibido:</p>
          <ul>
            <li>Usar la plataforma para fines ilegales o no autorizados.</li>
            <li>Intentar acceder a cuentas o datos de otros usuarios sin autorización.</li>
            <li>Realizar ingeniería inversa, descompilar o desensamblar la plataforma.</li>
            <li>Introducir virus, malware o código malicioso.</li>
            <li>Utilizar bots, scrapers u otros medios automatizados no autorizados.</li>
            <li>Revender o sublicenciar el acceso a la plataforma sin autorización escrita.</li>
          </ul>

          <h2>11. Terminación y Eliminación de Cuenta</h2>
          <h3>11.1 Terminación por el Usuario</h3>
          <p>
            Puedes solicitar la eliminación de tu cuenta en cualquier momento desde la configuración
            o contactando a <a href="mailto:soporte@vitas.app">soporte@vitas.app</a>. Una vez
            procesada, tus datos personales serán eliminados conforme a nuestra Política de
            Privacidad.
          </p>
          <h3>11.2 Terminación por VITAS</h3>
          <p>
            Podemos suspender o cancelar tu cuenta si incumples estos Términos, si tu uso representa
            un riesgo de seguridad para la plataforma, o si es requerido por ley. Te notificaremos
            con antelación razonable salvo en casos de urgencia.
          </p>
          <h3>11.3 Efectos de la Terminación</h3>
          <p>
            Tras la terminación, perderás acceso a la plataforma y sus funcionalidades. Te
            proporcionaremos un período razonable para exportar tus datos antes de la eliminación
            definitiva.
          </p>

          <h2>12. Modificaciones a los Términos</h2>
          <p>
            Podemos actualizar estos Términos periódicamente. Te notificaremos de cambios
            sustanciales mediante correo electrónico o notificación en la plataforma con al menos
            treinta (30) días de antelación. El uso continuado de VITAS tras la notificación
            constituye la aceptación de los Términos modificados.
          </p>

          <h2>13. Legislación Aplicable y Jurisdicción</h2>
          <p>
            Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier
            controversia derivada de estos Términos se someterá a la jurisdicción exclusiva de los
            tribunales competentes de Ciudad de México, México.
          </p>

          <h2>14. Disposiciones Generales</h2>
          <ul>
            <li>
              Si alguna disposición de estos Términos resulta inválida o inaplicable, las restantes
              disposiciones permanecerán en pleno vigor y efecto.
            </li>
            <li>
              La falta de ejercicio de cualquier derecho bajo estos Términos no constituye renuncia
              al mismo.
            </li>
            <li>
              Estos Términos constituyen el acuerdo íntegro entre tú y VITAS en relación con el uso
              de la plataforma.
            </li>
          </ul>

          <h2>15. Contacto</h2>
          <p>
            Si tienes preguntas sobre estos Términos de Servicio, puedes contactarnos en:
          </p>
          <ul>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:soporte@vitas.app">soporte@vitas.app</a>
            </li>
            <li>
              <strong>Plataforma:</strong>{" "}
              <a href="https://futuro-club.vercel.app" target="_blank" rel="noopener noreferrer">
                futuro-club.vercel.app
              </a>
            </li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
};

export default TermsPage;
