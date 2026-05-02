/**
 * VITAS · Política de Privacidad · v1.0
 *
 * Cumple GDPR (Reglamento UE 2016/679) y LOPDGDD (Ley Orgánica 3/2018).
 *
 * IMPORTANTE: Pendiente revisión final por gestoría / DPO antes de producción.
 */

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate max-w-3xl mx-auto px-6 py-12">
      <header className="not-prose mb-8">
        <div className="text-xs uppercase tracking-widest text-purple-600 font-bold">Documento legal · v1.0</div>
        <h1 className="text-4xl font-rajdhani font-bold mt-2">Política de Privacidad</h1>
        <p className="text-slate-500 text-sm mt-2">Última actualización: 01 de mayo de 2026</p>
      </header>

      <p>
        En VITAS Football Intelligence ("VITAS") tratamos los datos personales de
        forma transparente y conforme a GDPR y LOPDGDD. Este documento explica
        qué datos recogemos, por qué y cómo puedes ejercer tus derechos.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Titular:</strong> VITAS Football Intelligence S.L. (en constitución)</li>
        <li><strong>Email DPO:</strong> dpo@vitas.app</li>
        <li><strong>Domicilio:</strong> España</li>
      </ul>

      <h2>2. Datos que recogemos</h2>
      <h3>2.1 Datos del usuario registrado</h3>
      <ul>
        <li>Email, nombre, contraseña hash</li>
        <li>Datos de facturación (nombre, dirección, NIF)</li>
        <li>Logs de uso (IP, user agent, timestamps de acciones)</li>
      </ul>

      <h3>2.2 Datos de jugadores menores</h3>
      <ul>
        <li>Nombre, fecha de nacimiento, posición, equipo</li>
        <li>Datos antropométricos: altura, peso, altura sentado (para cálculo PHV)</li>
        <li>Vídeos subidos por el tutor</li>
        <li>Métricas biomecánicas extraídas: keypoints, ángulos, asimetrías, sprint</li>
        <li>Embeddings de vídeo (vectores numéricos) para análisis comparativo</li>
        <li>VSI Score y subscores derivados</li>
      </ul>

      <h3>2.3 Datos del tutor parental (Art. 8 GDPR)</h3>
      <ul>
        <li>Nombre completo, email</li>
        <li>DNI/NIE (almacenado <strong>cifrado SHA-256</strong>, nunca en claro)</li>
        <li>IP y timestamp de firma del consentimiento</li>
      </ul>

      <h2>3. Base legal del tratamiento</h2>
      <ul>
        <li><strong>Ejecución del contrato</strong> (Art. 6.1.b GDPR): para prestar el servicio.</li>
        <li><strong>Consentimiento explícito</strong> (Art. 6.1.a + Art. 8): para datos de menores.</li>
        <li><strong>Interés legítimo</strong> (Art. 6.1.f): seguridad, fraude, mejora del producto.</li>
        <li><strong>Obligación legal</strong> (Art. 6.1.c): facturación y registros fiscales.</li>
      </ul>

      <h2>4. Finalidades</h2>
      <ul>
        <li>Generar análisis biomecánicos y reportes profesionales</li>
        <li>Comparar al jugador con jugadores profesionales (best-match)</li>
        <li>Calcular maduración biológica (Mirwald PHV)</li>
        <li>Mejorar el producto mediante análisis agregado y anonimizado</li>
        <li>Comunicaciones transaccionales (notificaciones, soporte)</li>
        <li>Marketing solo con consentimiento explícito</li>
      </ul>

      <h2>5. Plazos de conservación</h2>
      <ul>
        <li><strong>Vídeos brutos:</strong> 90 días tras subida</li>
        <li><strong>Métricas anonimizadas y embeddings:</strong> 5 años</li>
        <li><strong>Reportes generados:</strong> 5 años</li>
        <li><strong>Logs de auditoría GDPR:</strong> 7 años (obligación legal)</li>
        <li><strong>Datos de facturación:</strong> 6 años (obligación fiscal)</li>
      </ul>

      <h2>6. Destinatarios y transferencias</h2>
      <p>Compartimos datos solo con encargados de tratamiento estrictamente necesarios:</p>
      <ul>
        <li><strong>Anthropic (USA):</strong> generación de reportes IA · DPA firmado</li>
        <li><strong>Modal Labs (USA):</strong> procesamiento GPU · DPA firmado</li>
        <li><strong>Bunny CDN (UE):</strong> almacenamiento de vídeo</li>
        <li><strong>Supabase (UE/USA):</strong> base de datos</li>
        <li><strong>Voyage AI (USA):</strong> embeddings semánticos · DPA firmado</li>
        <li><strong>Resend (USA):</strong> emails transaccionales · DPA firmado</li>
        <li><strong>Stripe:</strong> procesamiento de pagos</li>
      </ul>
      <p>
        Las transferencias a USA se realizan bajo Cláusulas Contractuales Tipo
        (SCCs) de la Comisión Europea o Data Privacy Framework cuando aplique.
      </p>

      <h2>7. Tus derechos GDPR</h2>
      <p>Puedes ejercer los siguientes derechos contactando dpo@vitas.app:</p>
      <ul>
        <li><strong>Acceso (Art. 15):</strong> solicitar copia de tus datos</li>
        <li><strong>Rectificación (Art. 16):</strong> corregir datos inexactos</li>
        <li><strong>Supresión / olvido (Art. 17):</strong> borrar todos tus datos · disponible en <code>/account/delete-me</code></li>
        <li><strong>Limitación (Art. 18):</strong> bloquear el tratamiento</li>
        <li><strong>Portabilidad (Art. 20):</strong> recibir tus datos en formato estructurado</li>
        <li><strong>Oposición (Art. 21):</strong> oponerse al tratamiento basado en interés legítimo</li>
        <li><strong>Retirada del consentimiento</strong> en cualquier momento</li>
      </ul>
      <p>
        Tienes derecho a presentar una reclamación ante la <strong>Agencia Española
        de Protección de Datos</strong> (www.aepd.es).
      </p>

      <h2>8. Seguridad</h2>
      <ul>
        <li>Cifrado en tránsito (TLS 1.3) y en reposo (AES-256)</li>
        <li>Acceso por roles (RLS multi-tenant en BBDD)</li>
        <li>Hashing de contraseñas con bcrypt</li>
        <li>DNI cifrado SHA-256, nunca en claro</li>
        <li>Auditoría completa de acciones GDPR</li>
        <li>Backups cifrados con retención limitada</li>
      </ul>

      <h2>9. Decisiones automatizadas</h2>
      <p>
        Las métricas y reportes generados por VITAS son <strong>asistentes de
        decisión</strong>, no decisiones automatizadas con efectos jurídicos. Un
        scout o coach humano siempre toma la decisión final sobre fichajes,
        clasificaciones o evaluaciones.
      </p>

      <h2>10. Cambios en esta política</h2>
      <p>
        Cualquier modificación se notificará por email a los usuarios afectados
        con 30 días de antelación.
      </p>

      <h2>11. Contacto</h2>
      <p>
        DPO: <a href="mailto:dpo@vitas.app">dpo@vitas.app</a><br />
        Soporte: <a href="mailto:soporte@vitas.app">soporte@vitas.app</a>
      </p>

      <hr className="my-8" />
      <p className="text-xs text-slate-500">
        Versión: v1.0 · Pendiente revisión final por gestoría / DPO antes de
        lanzamiento comercial.
      </p>
    </article>
  );
}
