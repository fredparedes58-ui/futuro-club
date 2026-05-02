/**
 * VITAS · Política de Cookies · v1.0
 */

export default function CookiesPage() {
  function handleResetPrefs() {
    localStorage.removeItem("vitas_cookie_prefs_v1");
    window.location.reload();
  }

  return (
    <article className="prose prose-slate max-w-3xl mx-auto px-6 py-12">
      <header className="not-prose mb-8">
        <div className="text-xs uppercase tracking-widest text-purple-600 font-bold">Documento legal · v1.0</div>
        <h1 className="text-4xl font-rajdhani font-bold mt-2">Política de Cookies</h1>
        <p className="text-slate-500 text-sm mt-2">Última actualización: 01 de mayo de 2026</p>
      </header>

      <h2>1. Qué son las cookies</h2>
      <p>
        Pequeños archivos que almacena tu navegador con información sobre tu uso del sitio.
        Permiten recordar preferencias, autenticarte, y medir el rendimiento.
      </p>

      <h2>2. Cookies que usa VITAS</h2>

      <h3>🔒 Esenciales (siempre activas)</h3>
      <table className="w-full text-sm border-collapse">
        <thead><tr className="bg-slate-50"><th className="text-left p-2 border">Nombre</th><th className="text-left p-2 border">Finalidad</th><th className="text-left p-2 border">Duración</th></tr></thead>
        <tbody>
          <tr><td className="p-2 border"><code>sb-access-token</code></td><td className="p-2 border">Sesión Supabase</td><td className="p-2 border">7 días</td></tr>
          <tr><td className="p-2 border"><code>sb-refresh-token</code></td><td className="p-2 border">Renovación sesión</td><td className="p-2 border">30 días</td></tr>
          <tr><td className="p-2 border"><code>vitas_cookie_prefs_v1</code></td><td className="p-2 border">Preferencias de cookies</td><td className="p-2 border">12 meses</td></tr>
        </tbody>
      </table>

      <h3>📊 Analíticas (opcionales · requieren consentimiento)</h3>
      <table className="w-full text-sm border-collapse">
        <thead><tr className="bg-slate-50"><th className="text-left p-2 border">Proveedor</th><th className="text-left p-2 border">Finalidad</th><th className="text-left p-2 border">Duración</th></tr></thead>
        <tbody>
          <tr><td className="p-2 border">Plausible / GA4</td><td className="p-2 border">Métricas de uso anonimizadas</td><td className="p-2 border">24 meses</td></tr>
        </tbody>
      </table>

      <h3>📣 Marketing (opcionales · requieren consentimiento)</h3>
      <table className="w-full text-sm border-collapse">
        <thead><tr className="bg-slate-50"><th className="text-left p-2 border">Proveedor</th><th className="text-left p-2 border">Finalidad</th><th className="text-left p-2 border">Duración</th></tr></thead>
        <tbody>
          <tr><td className="p-2 border">Meta Pixel</td><td className="p-2 border">Atribución campañas</td><td className="p-2 border">90 días</td></tr>
        </tbody>
      </table>

      <h2>3. Tu control</h2>
      <p>
        Puedes cambiar tus preferencias en cualquier momento, incluso revocar todo
        el consentimiento.
      </p>

      <button
        onClick={handleResetPrefs}
        className="not-prose mt-4 px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold"
      >
        Restablecer preferencias de cookies
      </button>

      <h2>4. Cookies de terceros</h2>
      <p>
        Cuando usas funciones de pago (Stripe), reproducción de vídeo (Bunny) o
        emails (Resend), estos servicios pueden establecer sus propias cookies
        regidas por sus políticas.
      </p>

      <h2>5. Más información</h2>
      <p>
        Para detalles sobre tratamiento de datos personales asociados a estas
        cookies, consulta nuestra <a href="/legal/privacy">Política de Privacidad</a>.
      </p>
    </article>
  );
}
