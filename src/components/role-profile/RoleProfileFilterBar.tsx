import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { POSITION_CODES, POSITION_LABELS, type PositionCode } from "@/lib/roleProfileData";

// ─── Schema ──────────────────────────────────────────────────────────────

const FilterSchema = z.object({
  horizon: z.enum(["current", "0_6m", "6_18m", "18_36m"]),
  currentPosition: z.enum(["all", ...POSITION_CODES] as [string, ...string[]]),
  showProjected: z.boolean(),
  dimension: z.enum(["all", "tactical", "technical", "physical"]),
  phase: z.enum(["all", "in_possession", "out_of_possession", "transition"]),
});

export type RoleProfileFilters = z.infer<typeof FilterSchema>;

const DEFAULTS: RoleProfileFilters = {
  horizon: "current",
  currentPosition: "all",
  showProjected: false,
  dimension: "all",
  phase: "all",
};

interface Props {
  onChange: (filters: RoleProfileFilters) => void;
  defaults?: Partial<RoleProfileFilters>;
}

export default function RoleProfileFilterBar({ onChange, defaults }: Props) {
  const { control, watch } = useForm<RoleProfileFilters>({
    resolver: zodResolver(FilterSchema),
    defaultValues: { ...DEFAULTS, ...defaults },
  });

  // React to every change
  const values = watch();

  // Emit validated filters on every change
  const handleChange = () => {
    const parsed = FilterSchema.safeParse(values);
    if (parsed.success) onChange(parsed.data);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-card border border-border rounded-lg">
      {/* Horizon */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Horizonte</Label>
        <Controller
          control={control}
          name="horizon"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => { field.onChange(v); handleChange(); }}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Actual</SelectItem>
                <SelectItem value="0_6m">0–6 meses</SelectItem>
                <SelectItem value="6_18m">6–18 meses</SelectItem>
                <SelectItem value="18_36m">18–36 meses</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Current position */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Posición</Label>
        <Controller
          control={control}
          name="currentPosition"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => { field.onChange(v); handleChange(); }}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {POSITION_CODES.map(code => (
                  <SelectItem key={code} value={code}>{code} — {POSITION_LABELS[code]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Dimension */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Dimensión</Label>
        <Controller
          control={control}
          name="dimension"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => { field.onChange(v); handleChange(); }}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="tactical">Táctica</SelectItem>
                <SelectItem value="technical">Técnica</SelectItem>
                <SelectItem value="physical">Física</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Phase */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Fase</Label>
        <Controller
          control={control}
          name="phase"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => { field.onChange(v); handleChange(); }}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="in_possession">En posesión</SelectItem>
                <SelectItem value="out_of_possession">Sin posesión</SelectItem>
                <SelectItem value="transition">Transición</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Projected toggle */}
      <div className="flex items-center gap-2 ml-auto">
        <Label className="text-xs text-muted-foreground">Proyectado</Label>
        <Controller
          control={control}
          name="showProjected"
          render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={(v) => { field.onChange(v); handleChange(); }} />
          )}
        />
      </div>
    </div>
  );
}
