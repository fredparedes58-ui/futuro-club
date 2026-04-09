/**
 * VITAS — TeamPage
 * /equipo — Lista de miembros del equipo + invitaciones (plan Club).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Users, Mail, Plus, Trash2, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/context/AuthContext";
import { useTeamMembers, useTeamInvitations, useInviteMember, useRemoveMember, useCancelInvitation } from "@/hooks/useTeam";
import { ROLE_LABELS, type UserRole } from "@/services/real/userProfileService";
import { PlanGuard } from "@/components/PlanGuard";
import { useTranslation } from "react-i18next";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function TeamPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, isDirector } = useUserProfile();
  const orgOwnerId = user?.id ?? "";

  const { data: members = [], isLoading: membersLoading } = useTeamMembers(orgOwnerId);
  const { data: invitations = [], isLoading: invLoading } = useTeamInvitations(orgOwnerId);

  const inviteMutation = useInviteMember(orgOwnerId);
  const removeMutation = useRemoveMember(orgOwnerId);
  const cancelMutation = useCancelInvitation(orgOwnerId);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("scout");
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await inviteMutation.mutateAsync({ email: inviteEmail.trim(), role: inviteRole });
      toast.success(t("toasts.invitationSent", { email: inviteEmail.trim() }));
      setInviteEmail("");
      setSheetOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("toasts.invitationSendError"));
    }
  };

  const handleRemove = async (memberId: string, name?: string) => {
    try {
      await removeMutation.mutateAsync(memberId);
      toast.success(t("toasts.memberRemoved", { name: name ?? "Miembro" }));
    } catch {
      toast.error(t("toasts.memberRemoveError"));
    }
  };

  const handleCancel = async (invId: string) => {
    try {
      await cancelMutation.mutateAsync(invId);
      toast.success(t("toasts.invitationCanceled"));
    } catch {
      toast.error(t("toasts.invitationCancelError"));
    }
  };

  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  return (
    <PlanGuard feature="roles">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="px-4 pt-4 pb-28 space-y-6 max-w-lg mx-auto"
      >
        {/* Header */}
        <motion.div variants={item} className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-bold text-2xl text-foreground">
              {t("team.title").replace(".", "")}<span className="text-primary">.</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {profile?.organizationName ?? t("team.myOrg")}
            </p>
          </div>
          {isDirector && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus size={13} /> {t("team.invite")}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
                <SheetHeader className="mb-4">
                  <SheetTitle className="font-display">{t("team.inviteMember")}</SheetTitle>
                </SheetHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-display text-muted-foreground uppercase tracking-wider">
                      {t("team.emailLabel")}
                    </label>
                    <Input
                      type="email"
                      placeholder={t("team.emailPlaceholder")}
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-display text-muted-foreground uppercase tracking-wider">
                      {t("team.roleLabel")}
                    </label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scout">{t("team.roles.scout")}</SelectItem>
                        <SelectItem value="coach">{t("team.roles.coach")}</SelectItem>
                        <SelectItem value="viewer">{t("team.roles.viewer")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || inviteMutation.isPending}
                  >
                    {inviteMutation.isPending ? t("team.sendingInvitation") : t("team.sendInvitation")}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </motion.div>

        {/* Miembros activos */}
        <motion.div variants={item}>
          <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users size={13} /> {t("team.activeMembers")}
          </h2>
          {membersLoading ? (
            <div className="glass rounded-xl p-4 text-center text-sm text-muted-foreground">
              {t("team.loadingMembers")}
            </div>
          ) : members.length === 0 ? (
            <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">
              {t("team.noMembers")}
            </div>
          ) : (
            <div className="glass rounded-xl divide-y divide-border">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-display font-bold text-primary">
                    {m.memberId.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-semibold text-foreground">
                      {m.displayName ?? m.memberId.slice(0, 8) + "…"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {ROLE_LABELS[m.role]} · {t("team.since")} {new Date(m.joinedAt).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  {isDirector && m.memberId !== orgOwnerId && (
                    <button
                      onClick={() => handleRemove(m.memberId)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Invitaciones pendientes */}
        {(pendingInvitations.length > 0 || invLoading) && (
          <motion.div variants={item}>
            <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Mail size={13} /> {t("team.pendingInvitations")}
            </h2>
            {invLoading ? (
              <div className="glass rounded-xl p-4 text-center text-sm text-muted-foreground">
                {t("team.loadingInvitations")}
              </div>
            ) : (
              <div className="glass rounded-xl divide-y divide-border">
                {pendingInvitations.map((inv) => {
                  const expired = new Date(inv.expiresAt) < new Date();
                  return (
                    <div key={inv.id} className="flex items-center gap-3 p-3">
                      {expired ? (
                        <XCircle size={16} className="text-muted-foreground shrink-0" />
                      ) : (
                        <Clock size={16} className="text-yellow-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display text-foreground truncate">{inv.email}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {ROLE_LABELS[inv.role]} · {t("team.expires")} {new Date(inv.expiresAt).toLocaleDateString("es-ES")}
                        </p>
                      </div>
                      {isDirector && (
                        <button
                          onClick={() => handleCancel(inv.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <XCircle size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* Info */}
        <motion.div variants={item} className="glass rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 size={16} className="text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            {t("team.inviteInfo")}
          </p>
        </motion.div>
      </motion.div>
    </PlanGuard>
  );
}
