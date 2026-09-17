/**
 * VITAS · Lead-gate del entorno DEMO
 *
 * Muro bloqueante ANTES de explorar el demo: el visitante deja sus datos y consiente
 * (RGPD) → se crea una solicitud 'pending' → el operador aprueba/rechaza/revoca por
 * email → el gate consulta el estado en el servidor (por eso la revocación surte
 * efecto). Solo actúa cuando IS_DEMO (en prod es un no-op). Diseño claro/luminoso
 * (regla: nada de fondos oscuros), independiente del tema oscuro de la app.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck, Clock, XCircle, Lock } from "lucide-react";
import { IS_DEMO } from "@/lib/demoMode";

// El demo corre sin Supabase → la captura la hace el proyecto principal (dominio krujens).
const API_BASE = (import.meta.env.VITE_DEMO_API_BASE as string | undefined) || "https://vitas.krujens.eu";
const LS_KEY = "vitas_demo_access";

type Phase = "checking" | "form" | "pending" | "approved" | "rejected" | "revoked" | "limit" | "error";

function loadToken(): string | null {
  try { return (JSON.parse(localStorage.getItem(LS_KEY) || "null") as { accessToken?: string } | null)?.accessToken ?? null; }
  catch { return null; }
}
function saveToken(t: string): void { try { localStorage.setItem(LS_KEY, JSON.stringify({ accessToken: t })); } catch { /* private mode */ } }
function clearToken(): void { try { localStorage.removeItem(LS_KEY); } catch { /* private mode */ } }

export default function DemoGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>(IS_DEMO ? "checking" : "approved");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", club: "", role: "", email: "", phone: "", consent: false, website: "" });
  const [consentError, setConsentError] = useState(false);
  const tokenRef = useRef<string | null>(loadToken());

  // Enlace mágico del email de aprobación (?demo_token=…): guarda el token y limpia la URL,
  // para que el solicitante entre desde CUALQUIER dispositivo, no solo su navegador original.
  // Declarado ANTES del polling para que tokenRef ya esté puesto cuando el polling consulte.
  useEffect(() => {
    if (!IS_DEMO) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const magic = params.get("demo_token");
      if (magic) {
        saveToken(magic);
        tokenRef.current = magic;
        params.delete("demo_token");
        const clean = window.location.pathname + (params.toString() ? `?${params.toString()}` : "") + window.location.hash;
        window.history.replaceState(null, "", clean);
      }
    } catch { /* private mode / SSR-safe */ }
  }, []);

  // Consulta de estado al cargar + polling (detecta aprobación y revocación).
  useEffect(() => {
    if (!IS_DEMO) return;
    let stop = false;
    const check = async () => {
      const tk = tokenRef.current;
      if (!tk) { if (!stop) setPhase((p) => (p === "checking" ? "form" : p)); return; }
      try {
        const r = await fetch(`${API_BASE}/api/demo/status?token=${encodeURIComponent(tk)}`);
        const d = (await r.json()) as { status?: string };
        if (stop) return;
        const s = d?.status;
        setPhase(s === "approved" ? "approved" : s === "rejected" ? "rejected" : s === "revoked" ? "revoked" : "pending");
      } catch {
        if (!stop) setPhase((p) => (p === "checking" ? "pending" : p));
      }
    };
    check();
    const iv = setInterval(check, 7000);
    return () => { stop = true; clearInterval(iv); };
  }, []);

  // No-op fuera del demo, y deja pasar las páginas legales (enlace de privacidad del consentimiento).
  if (!IS_DEMO) return <>{children}</>;
  if (location.pathname === "/privacy" || location.pathname === "/terms") return <>{children}</>;
  if (phase === "approved") return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.consent) { setConsentError(true); return; }
    setConsentError(false);
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/api/demo/request`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" }, // simple request → sin preflight CORS
        body: JSON.stringify({
          name: form.name, club: form.club, role: form.role, email: form.email, phone: form.phone,
          consent: true, demo_slug: window.location.host, website: form.website,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; accessToken?: string };
      if (r.status === 403 && d?.status === "limit") { setPhase("limit"); return; }
      if (!r.ok || !d?.ok || !d.accessToken) { setPhase("error"); return; }
      tokenRef.current = d.accessToken;
      saveToken(d.accessToken);
      setPhase("pending");
    } catch {
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  };

  const requestAgain = () => { clearToken(); tokenRef.current = null; setPhase("form"); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflowY: "auto",
      background: "linear-gradient(160deg,#eaf2ff 0%,#f4f8ff 60%,#ffffff 100%)" }}>
      <div className="min-h-full flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl bg-white border border-[#dbe6ff] shadow-[0_18px_60px_rgba(0,89,179,0.10)] p-6 sm:p-7">
          {/* Marca */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#0059B3]">{t("demoGate.kicker")}</span>
          </div>

          {phase === "checking" && (
            <div className="py-10 text-center text-[#37425f]">
              <Loader2 className="mx-auto mb-3 animate-spin text-[#0059B3]" size={26} />
              {t("demoGate.checking")}
            </div>
          )}

          {(phase === "form" || phase === "error" || phase === "limit") && (
            <>
              <h1 className="text-2xl font-bold text-[#0b1226] mt-1">{t("demoGate.title")}</h1>
              <p className="text-sm text-[#37425f] mt-1.5 mb-4">{t("demoGate.subtitle")}</p>

              {phase === "limit" && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-800">
                  <b>{t("demoGate.limitTitle")}</b> · {t("demoGate.limitText")}
                </div>
              )}
              {phase === "error" && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">
                  {t("demoGate.errorText")}
                </div>
              )}

              <form onSubmit={submit} className="space-y-3">
                <Field label={t("demoGate.name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })}
                  placeholder={t("demoGate.namePh")} required autoComplete="name" />
                <Field label={t("demoGate.club")} value={form.club} onChange={(v) => setForm({ ...form, club: v })}
                  placeholder={t("demoGate.clubPh")} required autoComplete="organization" />
                <Field label={t("demoGate.role")} value={form.role} onChange={(v) => setForm({ ...form, role: v })}
                  placeholder={t("demoGate.rolePh")} required />
                <Field label={t("demoGate.email")} value={form.email} onChange={(v) => setForm({ ...form, email: v })}
                  placeholder={t("demoGate.emailPh")} required type="email" autoComplete="email" />
                <Field label={`${t("demoGate.phone")} · ${t("demoGate.optional")}`} value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })} placeholder={t("demoGate.phonePh")} type="tel" autoComplete="tel" />

                {/* Honeypot anti-bots */}
                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

                {/* Consentimiento RGPD */}
                <label className="flex items-start gap-2 text-[12px] text-[#37425f] leading-snug cursor-pointer pt-1">
                  <input type="checkbox" checked={form.consent} className="mt-0.5 accent-[#0059B3]"
                    onChange={(e) => { setForm({ ...form, consent: e.target.checked }); if (e.target.checked) setConsentError(false); }} />
                  <span>
                    {t("demoGate.consentPre")}{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer" className="text-[#0059B3] underline">{t("demoGate.consentLink")}</a>
                    {t("demoGate.consentPost")}
                  </span>
                </label>
                {consentError && <p className="text-[12px] text-red-600">{t("demoGate.consentRequired")}</p>}

                <button type="submit" disabled={submitting}
                  className="w-full mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0059B3] hover:bg-[#00448C] text-white font-semibold text-sm py-3 transition-colors disabled:opacity-60">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
                  {phase === "error" ? t("demoGate.retry") : t("demoGate.submit")}
                </button>
              </form>
              <p className="text-[11px] text-[#6c7794] mt-3 text-center">{t("demoGate.privacyNote")}</p>
            </>
          )}

          {phase === "pending" && (
            <div className="py-8 text-center">
              <Clock className="mx-auto mb-3 text-[#0059B3]" size={30} />
              <h1 className="text-xl font-bold text-[#0b1226]">{t("demoGate.pendingTitle")}</h1>
              <p className="text-sm text-[#37425f] mt-2">{t("demoGate.pendingText")}</p>
              <div className="mt-4 inline-flex items-center gap-2 text-[12px] text-[#6c7794]">
                <Loader2 size={14} className="animate-spin" /> {t("demoGate.pendingWaiting")}
              </div>
            </div>
          )}

          {phase === "rejected" && (
            <div className="py-8 text-center">
              <XCircle className="mx-auto mb-3 text-[#E5484D]" size={30} />
              <h1 className="text-xl font-bold text-[#0b1226]">{t("demoGate.rejectedTitle")}</h1>
              <p className="text-sm text-[#37425f] mt-2">{t("demoGate.rejectedText")}</p>
            </div>
          )}

          {phase === "revoked" && (
            <div className="py-8 text-center">
              <ShieldCheck className="mx-auto mb-3 text-[#6c7794]" size={30} />
              <h1 className="text-xl font-bold text-[#0b1226]">{t("demoGate.revokedTitle")}</h1>
              <p className="text-sm text-[#37425f] mt-2">{t("demoGate.revokedText")}</p>
              <button onClick={requestAgain}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-[#dbe6ff] text-[#0059B3] font-semibold text-sm px-5 py-2.5 hover:bg-[#f4f8ff] transition-colors">
                {t("demoGate.revokedAgain")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, type = "text", autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  required?: boolean; type?: string; autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-[#6c7794] mb-1">{label}</span>
      <input
        type={type} value={value} required={required} placeholder={placeholder} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#dbe6ff] bg-[#f8fbff] px-3 py-2.5 text-[14px] text-[#0b1226] placeholder-[#9fb2d6] outline-none focus:border-[#0059B3] focus:bg-white transition-colors"
      />
    </label>
  );
}
