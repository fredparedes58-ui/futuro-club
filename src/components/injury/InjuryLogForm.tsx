/**
 * InjuryLogForm — Register / edit / view injury history for a player
 *
 * Used in:
 * - PlayerHubPage (tab "Salud") — CRUD for medical staff
 *
 * Persists to Supabase `player_injuries` table via /api/injuries/save endpoint.
 * Fallback to localStorage if API unavailable.
 *
 * Sprint 10: Injury Risk Model & Data
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Save,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────────────────────────────

export interface InjuryEntry {
  id?: string;
  type: string;
  severity: "mild" | "moderate" | "severe";
  bodyPart: string;
  date: string;
  daysOut: number | null;
  mechanism?: string;
  notes?: string;
  isRecurrent?: boolean;
}

interface InjuryLogFormProps {
  playerId: string;
  /** Existing injuries to display/edit */
  injuries: InjuryEntry[];
  /** Called when injuries change (add/edit/delete) */
  onChange: (injuries: InjuryEntry[]) => void;
  /** Called on save (persist to API/localStorage) */
  onSave?: (injuries: InjuryEntry[]) => Promise<void>;
  /** Read-only mode for parents/scouts */
  readOnly?: boolean;
  /** Compact mode for onboarding wizard */
  compact?: boolean;
  /** Maximum injuries to show before "show more" */
  maxVisible?: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const BODY_PARTS = [
  "Rodilla", "Tobillo", "Isquiotibiales", "Cuadriceps", "Aductor",
  "Cadera", "Espalda baja", "Hombro", "Muneca", "Pie",
  "Gemelos", "Tibia", "Pubis", "Cabeza", "Otro",
];

const INJURY_TYPES = [
  "Muscular", "Ligamento", "Osea", "Tendinitis", "Contusion",
  "Fractura", "Esguince", "Sobrecarga", "Apofisitis", "Otro",
];

const SEVERITY_CONFIG = {
  mild:     { label: "Leve",     color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20", days: "1-7 dias" },
  moderate: { label: "Moderada", color: "bg-amber-500/15 text-amber-600 border-amber-500/20", days: "7-28 dias" },
  severe:   { label: "Grave",    color: "bg-red-500/15 text-red-600 border-red-500/20", days: "28+ dias" },
};

// ── Empty entry factory ─────────────────────────────────────────────────────

function createEmptyEntry(): InjuryEntry {
  return {
    type: "",
    severity: "mild",
    bodyPart: "",
    date: new Date().toISOString().slice(0, 10),
    daysOut: null,
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function InjuryLogForm({
  playerId,
  injuries,
  onChange,
  onSave,
  readOnly = false,
  compact = false,
  maxVisible = 5,
}: InjuryLogFormProps) {
  const [editing, setEditing] = useState<InjuryEntry | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const visibleInjuries = showAll ? injuries : injuries.slice(0, maxVisible);

  const handleAdd = useCallback(() => {
    setEditing(createEmptyEntry());
  }, []);

  const handleSaveEntry = useCallback(() => {
    if (!editing) return;
    if (!editing.type || !editing.bodyPart) {
      toast.error("Completa tipo y zona corporal");
      return;
    }
    const updated = editing.id
      ? injuries.map((inj) => (inj.id === editing.id ? editing : inj))
      : [...injuries, { ...editing, id: `local-${Date.now()}` }];
    onChange(updated);
    setEditing(null);
    toast.success(editing.id ? "Lesion actualizada" : "Lesion registrada");
  }, [editing, injuries, onChange]);

  const handleDelete = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      onChange(injuries.filter((inj) => inj.id !== id));
      toast.success("Lesion eliminada");
    },
    [injuries, onChange],
  );

  const handlePersist = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(injuries);
      toast.success("Historial guardado");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [injuries, onSave]);

  // ── Compact mode for onboarding ──────────────────────────────
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-display font-semibold text-foreground">
            Historial de lesiones
          </p>
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={handleAdd} className="h-7 gap-1 text-xs">
              <Plus size={12} /> Agregar
            </Button>
          )}
        </div>
        {injuries.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Sin lesiones registradas (puedes agregar despues)
          </p>
        ) : (
          <div className="space-y-1.5">
            {injuries.slice(0, 3).map((inj) => (
              <div key={inj.id} className="flex items-center gap-2 text-xs bg-card/50 rounded-lg px-2 py-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${SEVERITY_CONFIG[inj.severity].color}`}>
                  {SEVERITY_CONFIG[inj.severity].label}
                </span>
                <span className="text-foreground">{inj.type}</span>
                <span className="text-muted-foreground">· {inj.bodyPart}</span>
                <span className="ml-auto text-muted-foreground">{inj.date}</span>
              </div>
            ))}
          </div>
        )}
        {/* Inline edit form */}
        <AnimatePresence>
          {editing && <InlineEditForm entry={editing} onChange={setEditing} onSave={handleSaveEntry} onCancel={() => setEditing(null)} />}
        </AnimatePresence>
      </div>
    );
  }

  // ── Full mode ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-sm text-foreground">Historial de Lesiones</h3>
          <p className="text-[10px] text-muted-foreground">
            {injuries.length} lesion{injuries.length !== 1 ? "es" : ""} registrada{injuries.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onSave && injuries.length > 0 && !readOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePersist}
              disabled={saving}
              className="h-7 gap-1 text-xs"
            >
              <Save size={12} />
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          )}
          {!readOnly && (
            <Button variant="default" size="sm" onClick={handleAdd} className="h-7 gap-1 text-xs">
              <Plus size={12} /> Nueva lesion
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {injuries.length === 0 && !editing && (
        <div className="text-center py-8 space-y-2">
          <CheckCircle size={24} className="text-emerald-500 mx-auto" />
          <p className="text-xs text-muted-foreground">
            Sin lesiones registradas
          </p>
          {!readOnly && (
            <p className="text-[10px] text-muted-foreground">
              Registrar el historial mejora la precision del modelo de riesgo
            </p>
          )}
        </div>
      )}

      {/* Injury list */}
      <div className="space-y-2">
        {visibleInjuries.map((inj) => (
          <motion.div
            key={inj.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 rounded-xl bg-card/60 border border-border/30 px-3 py-2.5 group"
          >
            {/* Severity dot */}
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                inj.severity === "severe" ? "bg-red-500" :
                inj.severity === "moderate" ? "bg-amber-500" :
                "bg-emerald-500"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{inj.type}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${SEVERITY_CONFIG[inj.severity].color}`}>
                  {SEVERITY_CONFIG[inj.severity].label}
                </span>
                {inj.isRecurrent && (
                  <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                    RECURRENTE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                <span>{inj.bodyPart}</span>
                <span>·</span>
                <Calendar size={9} />
                <span>{inj.date}</span>
                {inj.daysOut != null && (
                  <>
                    <span>·</span>
                    <span>{inj.daysOut} dias baja</span>
                  </>
                )}
              </div>
              {inj.notes && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{inj.notes}</p>
              )}
            </div>
            {!readOnly && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditing({ ...inj })}
                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
                  title="Editar"
                >
                  <AlertCircle size={12} />
                </button>
                <button
                  onClick={() => handleDelete(inj.id)}
                  className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                  title="Eliminar"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Show more */}
      {injuries.length > maxVisible && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-primary font-medium hover:underline w-full text-center"
        >
          Ver {injuries.length - maxVisible} mas
        </button>
      )}

      {/* Inline edit form */}
      <AnimatePresence>
        {editing && (
          <InlineEditForm
            entry={editing}
            onChange={setEditing}
            onSave={handleSaveEntry}
            onCancel={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Inline Edit Form ────────────────────────────────────────────────────────

function InlineEditForm({
  entry,
  onChange,
  onSave,
  onCancel,
}: {
  entry: InjuryEntry;
  onChange: (e: InjuryEntry) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-primary/20 bg-card/80 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-display font-bold text-foreground">
            {entry.id ? "Editar lesion" : "Nueva lesion"}
          </span>
          <button onClick={onCancel} className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Type */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Tipo</label>
            <select
              value={entry.type}
              onChange={(e) => onChange({ ...entry, type: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            >
              <option value="">Seleccionar...</option>
              {INJURY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Body part */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Zona corporal</label>
            <select
              value={entry.bodyPart}
              onChange={(e) => onChange({ ...entry, bodyPart: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            >
              <option value="">Seleccionar...</option>
              {BODY_PARTS.map((bp) => (
                <option key={bp} value={bp}>{bp}</option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Severidad</label>
            <div className="flex gap-1.5">
              {(["mild", "moderate", "severe"] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => onChange({ ...entry, severity: sev })}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                    entry.severity === sev
                      ? SEVERITY_CONFIG[sev].color
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {SEVERITY_CONFIG[sev].label}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Fecha</label>
            <input
              type="date"
              value={entry.date}
              onChange={(e) => onChange({ ...entry, date: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
          </div>

          {/* Days out */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Dias de baja</label>
            <input
              type="number"
              min={0}
              max={365}
              value={entry.daysOut ?? ""}
              onChange={(e) =>
                onChange({ ...entry, daysOut: e.target.value ? parseInt(e.target.value) : null })
              }
              placeholder="Opcional"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
          </div>

          {/* Mechanism */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Mecanismo</label>
            <input
              type="text"
              value={entry.mechanism ?? ""}
              onChange={(e) => onChange({ ...entry, mechanism: e.target.value })}
              placeholder="Ej: Sprint, cambio dir."
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">Notas (opcional)</label>
          <textarea
            value={entry.notes ?? ""}
            onChange={(e) => onChange({ ...entry, notes: e.target.value })}
            rows={2}
            placeholder="Observaciones adicionales..."
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none resize-none"
          />
        </div>

        {/* Recurrent checkbox */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={entry.isRecurrent ?? false}
            onChange={(e) => onChange({ ...entry, isRecurrent: e.target.checked })}
            className="rounded border-border"
          />
          <span className="text-[10px] text-muted-foreground">Lesion recurrente</span>
        </label>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">
            Cancelar
          </Button>
          <Button variant="default" size="sm" onClick={onSave} className="h-7 gap-1 text-xs">
            <Save size={12} />
            {entry.id ? "Actualizar" : "Registrar"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export { BODY_PARTS, INJURY_TYPES, SEVERITY_CONFIG };
