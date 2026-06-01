/**
 * VITAS · TransferFilters — sidebar/panel de filtros del marketplace
 */
import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LISTING_TYPES,
  LISTING_TYPE_LABELS,
} from "@/lib/transfer/transferConfig";
import type { ListingType } from "@/lib/transfer/transferConfig";
import type { TransferSearchQuery } from "@/lib/transfer/transferTypes";

interface Props {
  value: TransferSearchQuery;
  onChange: (q: TransferSearchQuery) => void;
}

const POSITIONS = ["POR", "DFC", "LD", "LI", "MCD", "MC", "MCO", "EXD", "EXI", "DC"];

export function TransferFilters({ value, onChange }: Props) {
  const [text, setText] = useState(value.text ?? "");

  function update(patch: Partial<TransferSearchQuery>) {
    onChange({ ...value, ...patch });
  }

  function togglePosition(p: string) {
    const cur = value.positions ?? [];
    update({
      positions: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    });
  }

  function toggleListingType(t: ListingType) {
    const cur = value.listingTypes ?? [];
    update({
      listingTypes: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    });
  }

  function clearAll() {
    setText("");
    onChange({});
  }

  return (
    <div className="space-y-4">
      {/* Free text */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">
          Búsqueda libre
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => update({ text: text || undefined })}
            onKeyDown={(e) => {
              if (e.key === "Enter") update({ text: text || undefined });
            }}
            placeholder="Nombre, descripción, tags…"
            className="pl-8 h-8 text-xs bg-white/[0.02] border-white/10"
          />
        </div>
      </div>

      {/* Listing types */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 block">
          Tipo de operación
        </label>
        <div className="flex flex-wrap gap-1">
          {LISTING_TYPES.map((t) => {
            const active = (value.listingTypes ?? []).includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleListingType(t)}
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  active
                    ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-200"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/25"
                }`}
              >
                {LISTING_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Positions */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 block">
          Posiciones
        </label>
        <div className="flex flex-wrap gap-1">
          {POSITIONS.map((p) => {
            const active = (value.positions ?? []).includes(p);
            return (
              <button
                key={p}
                onClick={() => togglePosition(p)}
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  active
                    ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-200"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/25"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Age range */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 block">
          Edad
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={value.minAge ?? ""}
            onChange={(e) =>
              update({ minAge: e.target.value ? parseInt(e.target.value, 10) : undefined })
            }
            className="h-8 text-xs bg-white/[0.02] border-white/10 w-20"
          />
          <span className="text-slate-500">–</span>
          <Input
            type="number"
            placeholder="Max"
            value={value.maxAge ?? ""}
            onChange={(e) =>
              update({ maxAge: e.target.value ? parseInt(e.target.value, 10) : undefined })
            }
            className="h-8 text-xs bg-white/[0.02] border-white/10 w-20"
          />
        </div>
      </div>

      {/* Min VSI */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 block">
          VSI mínimo
        </label>
        <Input
          type="number"
          placeholder="ej. 65"
          value={value.minVSI ?? ""}
          onChange={(e) =>
            update({ minVSI: e.target.value ? parseInt(e.target.value, 10) : undefined })
          }
          className="h-8 text-xs bg-white/[0.02] border-white/10 w-24"
        />
      </div>

      {/* Max price */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 block">
          Presupuesto máximo (€)
        </label>
        <Input
          type="number"
          placeholder="ej. 500000"
          value={value.maxPriceEur ?? ""}
          onChange={(e) =>
            update({ maxPriceEur: e.target.value ? parseInt(e.target.value, 10) : undefined })
          }
          className="h-8 text-xs bg-white/[0.02] border-white/10"
        />
      </div>

      {/* Active filters preview + clear */}
      {Object.keys(value).length > 0 && (
        <div className="pt-3 border-t border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Filtros activos
            </span>
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-6 text-xs">
              <X className="size-3 mr-1" />
              Limpiar
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {value.positions?.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px]">
                {p}
              </Badge>
            ))}
            {value.minAge && (
              <Badge variant="outline" className="text-[10px]">
                ≥{value.minAge}a
              </Badge>
            )}
            {value.maxAge && (
              <Badge variant="outline" className="text-[10px]">
                ≤{value.maxAge}a
              </Badge>
            )}
            {value.minVSI && (
              <Badge variant="outline" className="text-[10px]">
                VSI≥{value.minVSI}
              </Badge>
            )}
            {value.maxPriceEur && (
              <Badge variant="outline" className="text-[10px]">
                ≤€{(value.maxPriceEur / 1000).toFixed(0)}k
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
