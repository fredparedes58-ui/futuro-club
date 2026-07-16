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
import { useTranslation } from "react-i18next";

interface Props {
  playerId: string;
  childName?: string;
  onSuccess?: () => void;
}

export function ParentalConsentForm({ playerId, childName, onSuccess }: Props) {
  const { t } = useTranslation();
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
      setError(t("parentalConsentForm.errors.mustAccept"));
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
      if (!res.ok) throw new Error(data.message ?? t("parentalConsentForm.errors.signFailed"));

      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("parentalConsentForm.errors.unknown"));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="text-4xl mb-3">✉️</div>
        <h2 className="font-rajdhani text-xl font-bold mb-2">{t("parentalConsentForm.success.title")}</h2>
        <p className="text-sm text-slate-600">
          {t("parentalConsentForm.success.bodyBefore")}{" "}
          <strong>{parentEmail}</strong>{" "}
          {t("parentalConsentForm.success.bodyAfter")}
        </p>
        <p className="text-xs text-slate-500 mt-4">
          {t("parentalConsentForm.success.footer", { name: childName ?? t("parentalConsentForm.minorFallback") })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl mx-auto">
      <header>
        <div className="text-xs uppercase tracking-widest text-purple-600 font-bold mb-1">
          {t("parentalConsentForm.header.eyebrow")}
        </div>
        <h2 className="font-rajdhani text-2xl font-bold mb-2">
          {t("parentalConsentForm.header.title")}
        </h2>
        <p className="text-sm text-slate-600">
          {t("parentalConsentForm.header.descBefore")}{" "}
          <strong>{t("parentalConsentForm.header.descEmphasis")}</strong>{" "}
          {t("parentalConsentForm.header.descAfter")}
        </p>
      </header>

      <div>
        <label className="block text-sm font-semibold mb-1">{t("parentalConsentForm.fields.parentName")}</label>
        <input
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
          placeholder={t("parentalConsentForm.placeholders.parentName")}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">{t("parentalConsentForm.fields.parentEmail")}</label>
        <input
          type="email"
          required
          value={parentEmail}
          onChange={(e) => setParentEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
          placeholder={t("parentalConsentForm.placeholders.parentEmail")}
        />
        <p className="text-xs text-slate-500 mt-1">
          {t("parentalConsentForm.hints.parentEmail")}
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">{t("parentalConsentForm.fields.parentDni")}</label>
        <input
          type="text"
          required
          minLength={8}
          maxLength={20}
          pattern="[A-Za-z0-9]+"
          value={parentDni}
          onChange={(e) => setParentDni(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none uppercase"
          placeholder={t("parentalConsentForm.placeholders.parentDni")}
        />
        <p className="text-xs text-slate-500 mt-1">
          {t("parentalConsentForm.hints.parentDni")}
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">
          {t("parentalConsentForm.fields.childBirthdate", { name: childName ?? t("parentalConsentForm.minorFallback") })}
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
            {t("parentalConsentForm.terms.before")}{" "}
            <a href="/legal/terms" target="_blank" className="text-blue-600 underline">
              {t("parentalConsentForm.terms.link")}
            </a>{" "}
            {t("parentalConsentForm.terms.after")}
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
            {t("parentalConsentForm.privacy.before")}{" "}
            <a href="/legal/privacy" target="_blank" className="text-blue-600 underline">
              {t("parentalConsentForm.privacy.link")}
            </a>{" "}
            {t("parentalConsentForm.privacy.after")}
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
        {submitting ? t("parentalConsentForm.submit.sending") : t("parentalConsentForm.submit.default")}
      </button>

      <p className="text-xs text-center text-slate-500">
        {t("parentalConsentForm.footerNote")}
      </p>
    </form>
  );
}
