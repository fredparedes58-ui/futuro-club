/**
 * VITAS — AcceptInvitationPage
 * /aceptar-invitacion?token=...
 * Acepta una invitación de equipo.
 */

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { TeamService } from "@/services/real/teamService";
import { ROLE_LABELS, type UserRole } from "@/services/real/userProfileService";
import { useTranslation } from "react-i18next";

type PageState = "loading" | "success" | "error" | "needs-login";

const PENDING_TOKEN_KEY = "vitas_pending_invite_token";

export default function AcceptInvitationPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, configured } = useAuth();

  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [acceptedRole, setAcceptedRole] = useState<UserRole | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMsg(t("invitation.invalidToken"));
      return;
    }

    // No logueado → guardar token y redirigir a login
    if (configured && !user) {
      localStorage.setItem(PENDING_TOKEN_KEY, token);
      setState("needs-login");
      return;
    }

    if (!user) return;

    // Aceptar invitación
    TeamService.acceptInvitation(token, user.id)
      .then((res) => {
        setAcceptedRole(res.role);
        setState("success");
        // Limpiar token pendiente si había
        localStorage.removeItem(PENDING_TOKEN_KEY);
      })
      .catch((err: Error) => {
        setState("error");
        setErrorMsg(err.message);
      });
  }, [token, user, configured]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="glass rounded-2xl p-8 max-w-sm w-full text-center space-y-6"
      >
        <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto">
          <Users size={22} className="text-primary" />
        </div>
        <div className="text-2xl font-display font-bold text-foreground">
          VITAS<span className="text-primary">.</span>
        </div>

        {state === "loading" && (
          <div className="space-y-3">
            <Loader2 size={24} className="text-primary animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">{t("invitation.processing")}</p>
          </div>
        )}

        {state === "needs-login" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("invitation.needsLogin")}
            </p>
            <Button className="w-full" onClick={() => navigate("/login")}>
              {t("invitation.login")}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate("/register")}>
              {t("invitation.createAccount")}
            </Button>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-4">
            <CheckCircle2 size={32} className="text-green-500 mx-auto" />
            <div>
              <p className="font-display font-bold text-lg text-foreground">{t("invitation.acceptedTitle")}</p>
              {acceptedRole && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t("invitation.yourRole")} <span className="font-semibold text-primary">{ROLE_LABELS[acceptedRole]}</span>
                </p>
              )}
            </div>
            <Button className="w-full" onClick={() => navigate("/")}>
              {t("invitation.goToDashboard")}
            </Button>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <XCircle size={32} className="text-destructive mx-auto" />
            <div>
              <p className="font-display font-bold text-lg text-foreground">{t("invitation.errorTitle")}</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              {t("invitation.backToHome")}
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
