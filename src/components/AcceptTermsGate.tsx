/**
 * AcceptTermsGate — Blocks app until user accepts current terms & privacy.
 *
 * Renders a full-screen modal with links to terms/privacy pages.
 * Only shown when useLegalAcceptance.needsAcceptance is true.
 * Does NOT block during loading or on API error (graceful degradation).
 */

import { useState } from "react";
import { Shield, FileText, ExternalLink, Loader2 } from "lucide-react";
import { useLegalAcceptance } from "@/hooks/useLegalAcceptance";
import { useTranslation } from "react-i18next";

interface AcceptTermsGateProps {
  children: React.ReactNode;
}

export default function AcceptTermsGate({ children }: AcceptTermsGateProps) {
  const { t } = useTranslation();
  const legal = useLegalAcceptance();
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);

  // Don't block while loading or on error — graceful degradation
  if (legal.isLoading || !legal.needsAcceptance) {
    return <>{children}</>;
  }

  const canAccept = termsChecked && privacyChecked;

  const handleAccept = async () => {
    if (!canAccept) return;
    try {
      await legal.acceptAll();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Shield size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">
              {t("legal.acceptTitle", "Aceptar condiciones")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("legal.acceptSubtitle", "Para continuar usando VITAS")}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t(
            "legal.acceptDescription",
            "Para cumplir con la normativa de proteccion de datos, necesitamos que aceptes nuestros terminos actualizados antes de continuar."
          )}
        </p>

        {/* Checkboxes */}
        <div className="space-y-3">
          {/* Terms */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={termsChecked}
              onChange={(e) => setTermsChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <FileText size={13} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {t("legal.termsLabel", "Terminos de servicio")}
                </span>
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={11} />
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("legal.termsDesc", "He leido y acepto los terminos de uso de VITAS.")}
              </p>
            </div>
          </label>

          {/* Privacy */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={privacyChecked}
              onChange={(e) => setPrivacyChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <Shield size={13} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {t("legal.privacyLabel", "Politica de privacidad")}
                </span>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={11} />
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("legal.privacyDesc", "He leido y acepto la politica de privacidad y proteccion de datos.")}
              </p>
            </div>
          </label>
        </div>

        {/* Accept button */}
        <button
          onClick={handleAccept}
          disabled={!canAccept || legal.isAccepting}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-display font-semibold transition-all ${
            canAccept
              ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {legal.isAccepting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t("legal.accepting", "Registrando...")}
            </>
          ) : (
            t("legal.acceptButton", "Aceptar y continuar")
          )}
        </button>

        {/* Footer note */}
        <p className="text-[10px] text-center text-muted-foreground">
          {t(
            "legal.footerNote",
            "Puedes revocar tu consentimiento en cualquier momento desde Ajustes."
          )}
        </p>
      </div>
    </div>
  );
}
