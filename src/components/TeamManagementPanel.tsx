/**
 * TeamManagementPanel — Manage team members & invitations
 *
 * For directors: list current members, pending invitations,
 * invite new members (with plan-based limits), cancel invitations.
 *
 * Fase 3: integrated with usePlan for team member quotas.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, UserPlus, Mail, Trash2, Clock,
  Loader2, AlertCircle, Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { usePlan } from "@/hooks/usePlan";
import {
  TeamService,
  type TeamMember,
  type TeamInvitation,
} from "@/services/real/teamService";
import { ROLE_LABELS, type UserRole } from "@/services/real/userProfileService";

const INVITE_ROLES: { value: UserRole; label: string }[] = [
  { value: "scout", label: "Scout" },
  { value: "coach", label: "Entrenador" },
  { value: "viewer", label: "Visualizador" },
];

export default function TeamManagementPanel() {
  const { user } = useAuth();
  const planState = usePlan();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("scout");
  const [inviting, setInviting] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const orgOwnerId = user?.id ?? "";

  useEffect(() => {
    if (!orgOwnerId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgOwnerId]);

  async function loadData() {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        TeamService.getMembers(orgOwnerId),
        TeamService.getInvitations(orgOwnerId),
      ]);
      setMembers(m);
      setInvitations(i.filter((inv) => inv.status === "pending"));
      // Cache member count for usePlan
      try {
        localStorage.setItem("vitas_team_members", JSON.stringify(m));
      } catch { /* ignore */ }
    } catch {
      toast.error("Error al cargar equipo");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    if (!planState.canInviteMembers) {
      toast.error(`Limite de miembros alcanzado (${planState.teamMemberCount}/${planState.teamMemberLimit}). Upgrade tu plan.`);
      return;
    }

    setInviting(true);
    try {
      await TeamService.invite(orgOwnerId, inviteEmail.trim(), inviteRole);
      toast.success(`Invitacion enviada a ${inviteEmail}`);
      setInviteEmail("");
      setShowInviteForm(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al invitar");
    } finally {
      setInviting(false);
    }
  }

  async function handleCancelInvitation(inv: TeamInvitation) {
    try {
      await TeamService.cancelInvitation(inv.id);
      toast.success(`Invitacion para ${inv.email} cancelada`);
      await loadData();
    } catch {
      toast.error("Error al cancelar invitacion");
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    try {
      await TeamService.removeMember(orgOwnerId, member.memberId);
      toast.success("Miembro eliminado del equipo");
      await loadData();
    } catch {
      toast.error("Error al eliminar miembro");
    }
  }

  if (loading) {
    return (
      <div className="glass rounded-xl p-6 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header + Quota */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <h3 className="font-display font-bold text-sm text-foreground uppercase tracking-wider">
              Equipo
            </h3>
          </div>
          <span className="text-xs font-display text-muted-foreground">
            {members.length}/{planState.teamMemberLimit >= 9999 ? "∞" : planState.teamMemberLimit} miembros
          </span>
        </div>

        {/* Quota bar */}
        {planState.teamMemberLimit < 9999 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all ${
                members.length >= planState.teamMemberLimit
                  ? "bg-destructive"
                  : members.length >= planState.teamMemberLimit * 0.8
                    ? "bg-amber-500"
                    : "bg-primary"
              }`}
              style={{ width: `${Math.min(100, (members.length / planState.teamMemberLimit) * 100)}%` }}
            />
          </div>
        )}

        {/* Invite button */}
        <Button
          size="sm"
          className="w-full gap-2"
          onClick={() => setShowInviteForm(!showInviteForm)}
          disabled={!planState.canInviteMembers}
        >
          <UserPlus size={14} />
          {planState.canInviteMembers ? "Invitar miembro" : `Limite alcanzado (${planState.teamMemberLimit})`}
        </Button>
      </div>

      {/* Invite form */}
      {showInviteForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="glass rounded-xl p-4 space-y-3"
        >
          <div>
            <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Email
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="scout@academia.com"
              className="w-full text-sm bg-secondary/50 border border-border/30 rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Rol
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="w-full text-sm bg-secondary/50 border border-border/30 rounded-lg px-3 py-2 text-foreground cursor-pointer"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 gap-2"
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
            >
              {inviting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              Enviar invitacion
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowInviteForm(false)}
            >
              Cancelar
            </Button>
          </div>
        </motion.div>
      )}

      {/* Current members */}
      {members.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border/20">
            <p className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
              Miembros activos ({members.length})
            </p>
          </div>
          <div className="divide-y divide-border/10">
            {members.map((m) => (
              <div key={m.memberId} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-semibold text-foreground">
                    {m.displayName ?? m.email ?? m.memberId.slice(0, 8)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-display font-bold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.joinedAt).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveMember(m)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Eliminar miembro"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border/20">
            <p className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
              Invitaciones pendientes ({invitations.length})
            </p>
          </div>
          <div className="divide-y divide-border/10">
            {invitations.map((inv) => (
              <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-semibold text-foreground">{inv.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-display font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                      {ROLE_LABELS[inv.role] ?? inv.role}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock size={9} />
                      Expira {new Date(inv.expiresAt).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleCancelInvitation(inv)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Cancelar invitacion"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {members.length === 0 && invitations.length === 0 && (
        <div className="glass rounded-xl p-6 text-center">
          <Users size={20} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Aun no hay miembros en tu equipo. Invita scouts, entrenadores o visualizadores.
          </p>
        </div>
      )}
    </motion.div>
  );
}
