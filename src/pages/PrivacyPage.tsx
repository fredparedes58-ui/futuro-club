import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Shield } from "lucide-react";

const LAST_UPDATED = "12 de abril de 2026";

const PrivacyPage = () => {
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
          <Lock size={18} className="text-primary" />
          <h1 className="font-display font-bold text-sm uppercase tracking-wider">
            Política de Privacidad
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
            En <strong>VITAS</strong> nos comprometemos a proteger tu privacidad y la de los datos
            que confías a nuestra plataforma. Esta Política de Privacidad describe cómo recopilamos,
            utilizamos, almacenamos y protegemos tu información personal cuando usas nuestros
            servicios en{" "}
            <a href="https://futuro-club.vercel.app" target="_blank" rel="noopener noreferrer">
              futuro-club.vercel.app
            </a>.
          </p>

          <h2>1. Responsable del Tratamiento</h2>
          <p>
            El responsable del tratamiento de tus datos personales es <strong>VITAS</strong>.
            Puedes contactarnos en cualquier momento para ejercer tus derechos o resolver dudas
            sobre privacidad:
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

          <h2>2. Datos que Recopilamos</h2>
          <h3>2.1 Datos de Cuenta</h3>
          <ul>
            <li>Dirección de correo electrónico.</li>
            <li>Nombre y apellidos.</li>
            <li>Foto de perfil (opcional).</li>
            <li>Rol dentro de la organización (entrenador, director, scout, etc.).</li>
            <li>Preferencias de idioma y configuración de la aplicación.</li>
          </ul>

          <h3>2.2 Datos de Jugadores</h3>
          <ul>
            <li>Nombre, fecha de nacimiento, posición y datos físicos (altura, peso).</li>
            <li>Estadísticas de rendimiento y métricas deportivas.</li>
            <li>Evaluaciones de scouting, notas técnicas y perfiles de rol.</li>
            <li>Historial de evolución y proyecciones de desarrollo (PHV, etc.).</li>
          </ul>

          <h3>2.3 Contenido de Video</h3>
          <ul>
            <li>Videos de partidos, entrenamientos y sesiones de análisis subidos por los usuarios.</li>
            <li>Metadatos asociados (fecha, duración, equipo, competición).</li>
            <li>Análisis generados por IA a partir de los videos.</li>
          </ul>

          <h3>2.4 Datos Técnicos y de Uso</h3>
          <ul>
            <li>Dirección IP, tipo de navegador y dispositivo.</li>
            <li>Páginas visitadas, funcionalidades utilizadas y patrones de navegación.</li>
            <li>Datos de rendimiento de la aplicación y registros de errores.</li>
            <li>Token de suscripción para notificaciones push.</li>
          </ul>

          <h3>2.5 Datos de Facturación</h3>
          <ul>
            <li>Historial de transacciones y plan de suscripción activo.</li>
            <li>
              Los datos de pago (número de tarjeta, etc.) son procesados directamente por Stripe
              y nunca son almacenados en nuestros servidores.
            </li>
          </ul>

          <h2>3. Finalidad del Tratamiento</h2>
          <p>Utilizamos tus datos para:</p>
          <ul>
            <li>Crear y gestionar tu cuenta de usuario.</li>
            <li>Prestar los servicios contratados (análisis, scouting, informes, etc.).</li>
            <li>Procesar pagos y gestionar suscripciones.</li>
            <li>Generar análisis mediante inteligencia artificial.</li>
            <li>Enviar notificaciones relevantes sobre tu actividad.</li>
            <li>Mejorar y optimizar la plataforma.</li>
            <li>Cumplir con obligaciones legales.</li>
            <li>Prevenir fraude y garantizar la seguridad de la plataforma.</li>
          </ul>

          <h2>4. Base Legal del Tratamiento</h2>
          <p>El tratamiento de tus datos se fundamenta en:</p>
          <ul>
            <li>
              <strong>Ejecución del contrato:</strong> El procesamiento necesario para prestarte
              los servicios contratados (art. 6.1.b RGPD).
            </li>
            <li>
              <strong>Consentimiento:</strong> Para el envío de notificaciones push, comunicaciones
              de marketing y el procesamiento de datos mediante proveedores de IA (art. 6.1.a RGPD).
            </li>
            <li>
              <strong>Interés legítimo:</strong> Para mejorar nuestros servicios, prevenir fraude
              y garantizar la seguridad de la plataforma (art. 6.1.f RGPD).
            </li>
            <li>
              <strong>Obligación legal:</strong> Para cumplir con requerimientos fiscales,
              contables o legales aplicables (art. 6.1.c RGPD).
            </li>
          </ul>

          <h2>5. Servicios de Terceros</h2>
          <p>
            Para prestar nuestros servicios, compartimos datos con los siguientes proveedores,
            todos ellos sujetos a acuerdos de procesamiento de datos:
          </p>

          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="text-left pr-6">Proveedor</th>
                  <th className="text-left pr-6">Finalidad</th>
                  <th className="text-left">Datos Compartidos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-6"><strong>Supabase</strong></td>
                  <td className="pr-6">Base de datos, autenticación, almacenamiento</td>
                  <td>Todos los datos de la aplicación</td>
                </tr>
                <tr>
                  <td className="pr-6"><strong>Stripe</strong></td>
                  <td className="pr-6">Procesamiento de pagos</td>
                  <td>Email, datos de facturación</td>
                </tr>
                <tr>
                  <td className="pr-6"><strong>Bunny CDN</strong></td>
                  <td className="pr-6">Almacenamiento y streaming de video</td>
                  <td>Contenido de video</td>
                </tr>
                <tr>
                  <td className="pr-6"><strong>Anthropic (Claude)</strong></td>
                  <td className="pr-6">Análisis con IA</td>
                  <td>Datos de jugadores, métricas, texto</td>
                </tr>
                <tr>
                  <td className="pr-6"><strong>Google (Gemini)</strong></td>
                  <td className="pr-6">Análisis de video con IA</td>
                  <td>Fotogramas de video, metadatos</td>
                </tr>
                <tr>
                  <td className="pr-6"><strong>Vercel</strong></td>
                  <td className="pr-6">Hosting y funciones serverless</td>
                  <td>Datos técnicos de solicitudes</td>
                </tr>
                <tr>
                  <td className="pr-6"><strong>Resend</strong></td>
                  <td className="pr-6">Email transaccional</td>
                  <td>Email del destinatario, contenido del mensaje</td>
                </tr>
                <tr>
                  <td className="pr-6"><strong>Upstash</strong></td>
                  <td className="pr-6">Caché y rate limiting</td>
                  <td>Identificadores de sesión</td>
                </tr>
                <tr>
                  <td className="pr-6"><strong>Sentry</strong></td>
                  <td className="pr-6">Monitoreo de errores</td>
                  <td>Datos técnicos, trazas de error</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>6. Períodos de Retención</h2>
          <ul>
            <li>
              <strong>Datos de cuenta:</strong> Mientras tu cuenta esté activa y hasta 30 días
              después de la solicitud de eliminación.
            </li>
            <li>
              <strong>Datos de jugadores:</strong> Mientras la cuenta que los creó permanezca activa.
              Se eliminan junto con la cuenta.
            </li>
            <li>
              <strong>Contenido de video:</strong> Mientras la cuenta esté activa. Los videos se
              eliminan de Bunny CDN dentro de los 30 días posteriores a la eliminación de cuenta.
            </li>
            <li>
              <strong>Datos de facturación:</strong> Se conservan durante el período legalmente
              requerido (mínimo 5 años para obligaciones fiscales).
            </li>
            <li>
              <strong>Registros técnicos:</strong> Máximo 90 días para logs de error y 30 días
              para registros de acceso.
            </li>
          </ul>

          <h2>7. Derechos del Usuario</h2>
          <p>
            De acuerdo con la legislación aplicable en materia de protección de datos, tienes
            derecho a:
          </p>
          <ul>
            <li>
              <strong>Acceso:</strong> Solicitar una copia de tus datos personales.
            </li>
            <li>
              <strong>Rectificación:</strong> Corregir datos inexactos o incompletos.
            </li>
            <li>
              <strong>Supresión:</strong> Solicitar la eliminación de tus datos personales
              ("derecho al olvido").
            </li>
            <li>
              <strong>Portabilidad:</strong> Recibir tus datos en un formato estructurado y de
              uso común (JSON/CSV).
            </li>
            <li>
              <strong>Oposición:</strong> Oponerte al tratamiento basado en interés legítimo.
            </li>
            <li>
              <strong>Limitación:</strong> Solicitar la restricción del tratamiento en determinadas
              circunstancias.
            </li>
            <li>
              <strong>Retirada del consentimiento:</strong> Retirar tu consentimiento en cualquier
              momento sin que ello afecte la licitud del tratamiento previo.
            </li>
          </ul>
          <p>
            Para ejercer cualquiera de estos derechos, contacta a{" "}
            <a href="mailto:soporte@vitas.app">soporte@vitas.app</a>. Responderemos a tu
            solicitud en un plazo máximo de 30 días.
          </p>

          <h2>8. Cookies y Almacenamiento Local</h2>
          <p>
            VITAS es una aplicación web progresiva (PWA) que utiliza las siguientes tecnologías
            de almacenamiento local:
          </p>
          <ul>
            <li>
              <strong>localStorage:</strong> Para almacenar preferencias de usuario, configuración
              de la aplicación, datos en caché para funcionamiento offline y tokens de sesión.
            </li>
            <li>
              <strong>Service Worker:</strong> Para habilitar el funcionamiento offline, gestionar
              la caché de la aplicación y recibir notificaciones push.
            </li>
            <li>
              <strong>IndexedDB:</strong> Para almacenamiento local de datos de rendimiento en
              modo offline.
            </li>
          </ul>
          <p>
            No utilizamos cookies de seguimiento de terceros ni tecnologías de publicidad
            dirigida.
          </p>

          <h2>9. Notificaciones Push</h2>
          <p>
            VITAS puede enviarte notificaciones push a través del navegador para informarte sobre:
          </p>
          <ul>
            <li>Análisis completados y nuevos insights disponibles.</li>
            <li>Alertas de rendimiento de jugadores.</li>
            <li>Actualizaciones de tu equipo o grupo de scouting.</li>
            <li>Información sobre tu suscripción.</li>
          </ul>
          <p>
            Las notificaciones push requieren tu consentimiento explícito y puedes desactivarlas
            en cualquier momento desde la configuración de la aplicación o de tu navegador.
          </p>

          <h2>10. Datos de Menores de Edad</h2>
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 my-4">
            <p className="!mt-0">
              <strong>Sección importante:</strong> VITAS es una plataforma de scouting e
              inteligencia deportiva enfocada en fútbol juvenil, por lo que inevitablemente
              gestiona datos relativos a menores de edad.
            </p>
          </div>
          <h3>10.1 Consentimiento Parental</h3>
          <p>
            El registro y uso de datos de jugadores menores de edad requiere el consentimiento
            del padre, madre, tutor legal o representante autorizado del menor. Las organizaciones
            (clubs, academias) que utilicen VITAS son responsables de obtener y documentar dicho
            consentimiento antes de ingresar datos de menores en la plataforma.
          </p>
          <h3>10.2 Datos Mínimos</h3>
          <p>
            Aplicamos el principio de minimización de datos. Solo recopilamos la información
            estrictamente necesaria para prestar el servicio deportivo solicitado. No recopilamos
            datos de menores con fines de marketing, elaboración de perfiles comerciales ni
            publicidad.
          </p>
          <h3>10.3 Protecciones Adicionales</h3>
          <ul>
            <li>Los datos de menores no se comparten con terceros salvo los proveedores
              estrictamente necesarios para prestar el servicio (ver sección 5).
            </li>
            <li>El acceso a datos de menores está restringido a los roles autorizados dentro
              de la organización.
            </li>
            <li>Los padres, madres o tutores pueden solicitar en cualquier momento el acceso,
              rectificación o eliminación de los datos de sus hijos.
            </li>
            <li>No utilizamos datos de menores para entrenar modelos de inteligencia artificial
              propios.
            </li>
          </ul>
          <h3>10.4 Edad Mínima</h3>
          <p>
            Para crear una cuenta de usuario en VITAS se requiere ser mayor de 16 años (o la
            edad mínima establecida por la legislación aplicable). Los menores de esa edad solo
            pueden ser registrados como jugadores por un adulto autorizado.
          </p>

          <h2>11. Transferencias Internacionales de Datos</h2>
          <p>
            Tus datos pueden ser transferidos y procesados en servidores ubicados fuera de tu país
            de residencia, incluyendo Estados Unidos y la Unión Europea. Cuando sea necesario,
            implementamos las salvaguardas adecuadas conforme a la legislación aplicable, tales
            como:
          </p>
          <ul>
            <li>Cláusulas contractuales tipo aprobadas por la Comisión Europea.</li>
            <li>Proveedores adheridos a marcos de privacidad reconocidos (como el EU-US Data
              Privacy Framework).
            </li>
            <li>Cifrado de datos en tránsito y en reposo.</li>
          </ul>

          <h2>12. Medidas de Seguridad</h2>
          <p>
            Implementamos medidas técnicas y organizativas para proteger tus datos, incluyendo:
          </p>
          <ul>
            <li>Cifrado de datos en tránsito (TLS/HTTPS) y en reposo.</li>
            <li>Autenticación segura con tokens JWT y sesiones gestionadas por Supabase.</li>
            <li>Control de acceso basado en roles (RBAC) y Row Level Security (RLS) a nivel
              de base de datos.
            </li>
            <li>Rate limiting y protección contra abuso mediante Upstash.</li>
            <li>Monitoreo continuo de errores y anomalías mediante Sentry.</li>
            <li>Backups regulares de la base de datos.</li>
            <li>Revisiones periódicas de seguridad.</li>
          </ul>

          <h2>13. Cambios en esta Política</h2>
          <p>
            Podemos actualizar esta Política de Privacidad periódicamente para reflejar cambios en
            nuestras prácticas o por motivos legales. Te notificaremos de cambios materiales
            mediante correo electrónico o notificación en la plataforma con al menos treinta (30)
            días de antelación. La fecha de última actualización se indica al inicio de este
            documento.
          </p>

          <h2>14. Contacto y Delegado de Protección de Datos</h2>
          <p>
            Para cualquier consulta relacionada con la privacidad de tus datos o para ejercer
            tus derechos, puedes contactarnos en:
          </p>
          <ul>
            <li>
              <strong>Email de privacidad:</strong>{" "}
              <a href="mailto:soporte@vitas.app">soporte@vitas.app</a>
            </li>
            <li>
              <strong>Plataforma:</strong>{" "}
              <a href="https://futuro-club.vercel.app" target="_blank" rel="noopener noreferrer">
                futuro-club.vercel.app
              </a>
            </li>
          </ul>
          <p>
            Si consideras que el tratamiento de tus datos no ha sido adecuado, tienes derecho a
            presentar una reclamación ante la autoridad de protección de datos competente en tu
            jurisdicción.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default PrivacyPage;
