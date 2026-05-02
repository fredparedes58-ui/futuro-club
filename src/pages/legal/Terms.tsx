/**
 * VITAS · Términos y Condiciones · v1.0
 *
 * IMPORTANTE: este es el TEMPLATE inicial. Antes de producción, una gestoría
 * o asesor legal debe revisarlo y adaptarlo a la jurisdicción española y al
 * modelo de negocio definitivo (especialmente el apartado de menores).
 */

export default function TermsPage() {
  return (
    <article className="prose prose-slate max-w-3xl mx-auto px-6 py-12">
      <header className="not-prose mb-8">
        <div className="text-xs uppercase tracking-widest text-purple-600 font-bold">Documento legal · v1.0</div>
        <h1 className="text-4xl font-rajdhani font-bold mt-2">Términos y Condiciones de uso</h1>
        <p className="text-slate-500 text-sm mt-2">Última actualización: 01 de mayo de 2026</p>
      </header>

      <h2>1. Identificación del responsable</h2>
      <p>
        VITAS Football Intelligence (en adelante, "VITAS"), titular del software
        accesible en <code>vitas.app</code>. Datos identificativos completos disponibles
        en el aviso legal.
      </p>

      <h2>2. Objeto del servicio</h2>
      <p>
        VITAS proporciona análisis automático de vídeos de fútbol mediante visión
        computacional e inteligencia artificial, generando reportes profesionales
        sobre técnica, biomecánica, ADN futbolístico, comparables, proyección y
        plan de desarrollo de jugadores juveniles.
      </p>

      <h2>3. Usuarios autorizados</h2>
      <ul>
        <li>Padres/madres o tutores legales de jugadores menores</li>
        <li>Scouts profesionales o freelance</li>
        <li>Academias y clubes de fútbol</li>
        <li>Agencias de representación deportiva</li>
      </ul>
      <p>
        <strong>Menores de 14 años:</strong> requieren consentimiento parental verificado
        antes de cualquier uso (GDPR Art. 8 + LOPD Art. 7).
      </p>

      <h2>4. Suscripciones y precios</h2>
      <p>
        Los planes vigentes y sus precios se publican en <a href="/pricing">vitas.app/pricing</a>.
        Las suscripciones son mensuales o anuales y se renuevan automáticamente
        salvo cancelación.
      </p>

      <h2>5. Uso aceptable</h2>
      <p>El usuario se compromete a:</p>
      <ul>
        <li>NO subir vídeos sin consentimiento de las personas grabadas</li>
        <li>NO usar VITAS con fines ilegales, fraudulentos o discriminatorios</li>
        <li>NO compartir credenciales con terceros</li>
        <li>NO realizar ingeniería inversa del software</li>
        <li>NO usar VITAS para tomar decisiones automatizadas con efectos jurídicos</li>
      </ul>

      <h2>6. Propiedad intelectual</h2>
      <p>
        El software, los modelos de IA, las fórmulas (incluido el VSI Score), los
        reportes generados y la marca VITAS son propiedad exclusiva de VITAS o
        sus licenciadores. Los vídeos subidos siguen siendo propiedad del usuario.
      </p>

      <h2>7. Limitación de responsabilidad</h2>
      <p>
        Los reportes y métricas de VITAS son informativos. <strong>No constituyen
        asesoramiento médico, deportivo profesional ni decisiones de fichaje.</strong>
        VITAS no garantiza resultados deportivos derivados del uso de la herramienta.
      </p>

      <h2>8. Cancelación y reembolso</h2>
      <p>
        El usuario puede cancelar la suscripción en cualquier momento. El reembolso
        se rige por la legislación española de consumidores: 14 días desde la
        contratación para servicios no comenzados.
      </p>

      <h2>9. Modificaciones</h2>
      <p>
        VITAS se reserva el derecho a modificar estos términos. Las modificaciones
        se notificarán por email con 30 días de antelación. Continuar usando el
        servicio implica aceptación.
      </p>

      <h2>10. Ley aplicable y jurisdicción</h2>
      <p>
        Estos términos se rigen por la legislación española. Para cualquier
        controversia, las partes se someten a los Juzgados y Tribunales del
        domicilio del consumidor.
      </p>

      <h2>11. Contacto</h2>
      <p>
        Para cualquier consulta: <a href="mailto:legal@vitas.app">legal@vitas.app</a>
      </p>

      <hr className="my-8" />
      <p className="text-xs text-slate-500">
        Versión: v1.0 · Pendiente revisión legal final por gestoría externa antes
        de lanzamiento comercial.
      </p>
    </article>
  );
}
