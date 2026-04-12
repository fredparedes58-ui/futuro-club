/**
 * VITAS · Cookie Consent Banner
 * Shows at bottom of screen on first visit. Stores preference in localStorage.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "cookie-consent";

export default function CookieConsent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  const accept = (level: "all" | "essential") => {
    localStorage.setItem(STORAGE_KEY, level);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-[9000] flex justify-center p-4 pb-safe"
        >
          <div className="w-full max-w-lg rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Cookie size={18} className="text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("cookies.banner")}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => accept("all")}
                className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-colors"
              >
                {t("cookies.accept")}
              </button>
              <button
                onClick={() => accept("essential")}
                className="flex-1 py-2 rounded-xl border border-border text-foreground text-xs font-display font-semibold hover:bg-secondary transition-colors"
              >
                {t("cookies.essential")}
              </button>
            </div>

            <button
              onClick={() => {
                accept("essential");
                navigate("/privacy");
              }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <ExternalLink size={10} />
              <span>{t("cookies.moreInfo")}</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
