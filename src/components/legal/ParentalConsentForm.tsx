/**
 * VITAS · Parental Consent Form
 * Formulario que firma el padre/tutor antes de poder usar VITAS con un menor.
 *
 * Cumple GDPR Art. 8 y LOPD Art. 7.
 *
 * Uso:
 *   <ParentalConsentForm playerId={player.id} onSuccess={() => navigate("/")} />
 */

import { useState } from "react";

interface Props {
  playerId: string;
  childName?: string;
  onSuccess?: () => void;
}

export function ParentalConsentForm({ playerId, childName, onSuccess }: Props) {
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentDni, setParentDni] = useState("");
  const [childBirthdate, setChildBirthdate] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!acceptedTerms || !acceptedPrivacy) {
      setError("Debes aceptar los términos y la política de privacidad");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/sign-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          playerId,
          parentName,
          parentEmail,
          parentDni: parentDni.toUpperCase(),
          childBirthdate,
          acceptedTerms: true,
          acceptedPrivacy: true,
          consentVersion: "v1.0",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Error al firmar");

      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="text-4xl mb-3">✉️</div>
        <h2 className="font-rajdhani text-xl font-bold mb-2">Email enviado</h2>
        <p className="text-sm text-slate-600">
          Hemos enviado un email a <strong>{parentEmail}</strong> para verificar tu identidad como tutor legal.
          El enlace caduca en 24 horas.
        </p>
        <p className="text-xs text-slate-500 mt-4">
          Una vez verificado, {childName ?? "el menor"} podrá usar VITAS.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl mx-auto">
      <header>
        <div className="text-xs uppercase tracking-widest text-purple-600 font-bold mb-1">
          Consentimiento parental · GDPR Art. 8
        </div>
        <h2 className="font-rajdhani text-2xl font-bold mb-2">
          Solo el padre/madre o tutor legal puede registrar a un menor
        </h2>
        <p className="text-sm text-slate-600">
          Este consentimiento es <strong>obligatorio por ley</strong> para procesar datos de menores de 14 años.
          Recibirás un email de verificación tras enviar el formulario.
        </p>
      </header>

      <div>
        <label className="block text-sm font-semibold mb-1">Nombre completo del tutor</label>
        <input
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
          placeholder="María Pérez García"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Email del tutor</label>
        <input
          type="email"
          required
          value={parentEmail}
          onChange={(e) => setParentEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
          placeholder="madre@email.com"
        />
        <p className="text-xs text-slate-500 mt-1">
          Recibirás el enlace de verificación aquí. Caduca en 24h.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">DNI/NIE del tutor</label>
        <input
          type="text"
          required
          minLength={8}
          maxLength={20}
          pattern="[A-Za-z0-9]+"
          value={parentDni}
          onChange={(e) => setParentDni(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none uppercase"
          placeholder="12345678X"
        />
        <p className="text-xs text-slate-500 mt-1">
          Tu DNI se almacena cifrado · nunca lo guardamos en claro.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">
          Fecha de nacimiento de {childName ?? "el menor"}
        </label>
        <input
          type="date"
          required
          value={childBirthdate}
          onChange={(e) => setChildBirthdate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-200">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1 w-5 h-5 accent-purple-600"
            required
          />
          <span className="text-sm text-slate-700">
            He leído y acepto los{" "}
            <a href="/legal/terms" target="_blank" className="text-blue-600 underline">
              Términos y Condiciones
            </a>{" "}
            de VITAS.
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptedPrivacy}
            onChange={(e) => setAcceptedPrivacy(e.target.checked)}
            className="mt-1 w-5 h-5 accent-purple-600"
            required
          />
          <span className="text-sm text-slate-700">
            He leído y acepto la{" "}
            <a href="/legal/privacy" target="_blank" className="text-blue-600 underline">
              Política de Privacidad
            </a>{" "}
            y consiento expresamente el procesamiento de los datos de mi hijo/a (incluyendo
            análisis biomecánico y vídeos) para los fines descritos.
          </span>
        </label>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold disabled:opacity-50"
      >
        {submitting ? "Enviando..." : "Firmar consentimiento y enviar verificación"}
      </button>

      <p className="text-xs text-center text-slate-500">
        Puedes retirar este consentimiento en cualquier momento desde tu cuenta.
      </p>
    </form>
  );
}
