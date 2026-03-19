import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RoleProfileData, getPhaseLabel, getConfidenceColor, PhaseOfPlay } from "@/lib/roleProfileData";
import { useState } from "react";

interface Props {
  data: RoleProfileData;
  phaseFilter: PhaseOfPlay | "all";
  onOpenEvidence?: (indicator: string) => void;
}

export default function IndicatorsAuditTable({ data, phaseFilter, onOpenEvidence }: Props) {
  const filtered = phaseFilter === "all"
    ? data.evidence
    : data.evidence.filter(e => e.phase_of_play === phaseFilter);

  const [sortKey, setSortKey] = useState<"normalized" | "reliability" | "contribution">("contribution");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...filtered].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -diff : diff;
  });

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const impactColor = (i: string) =>
    i === "positivo" ? "text-primary" : i === "negativo" ? "text-danger" : "text-muted-foreground";

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-40">Indicador</TableHead>
            <TableHead className="w-20 text-right">Valor</TableHead>
            <TableHead className="w-20 text-right cursor-pointer select-none" onClick={() => handleSort("normalized")}>
              Score {sortKey === "normalized" && (sortDir === "desc" ? "↓" : "↑")}
            </TableHead>
            <TableHead className="w-20 text-right cursor-pointer select-none" onClick={() => handleSort("reliability")}>
              Fiabilidad {sortKey === "reliability" && (sortDir === "desc" ? "↓" : "↑")}
            </TableHead>
            <TableHead className="w-24">Fase</TableHead>
            <TableHead className="w-20 text-right cursor-pointer select-none" onClick={() => handleSort("contribution")}>
              Contrib. {sortKey === "contribution" && (sortDir === "desc" ? "↓" : "↑")}
            </TableHead>
            <TableHead className="w-28">Posiciones</TableHead>
            <TableHead className="w-36">Arquetipos</TableHead>
            <TableHead className="min-w-[200px]">Explicación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((ev) => (
            <TableRow
              key={ev.indicator}
              className="cursor-pointer hover:bg-muted/40"
              onClick={() => onOpenEvidence?.(ev.indicator)}
            >
              <TableCell className="font-medium text-sm">{ev.label}</TableCell>
              <TableCell className="text-right font-mono text-sm">{ev.raw_value}</TableCell>
              <TableCell className="text-right">
                <span className={`font-mono text-sm ${ev.normalized >= 70 ? "text-primary" : ev.normalized >= 50 ? "text-electric" : "text-muted-foreground"}`}>
                  {ev.normalized}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span className={`font-mono text-sm ${getConfidenceColor(ev.reliability)}`}>
                  {Math.round(ev.reliability * 100)}%
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {getPhaseLabel(ev.phase_of_play)}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <span className={`font-mono text-sm ${impactColor(ev.impact)}`}>
                  {ev.contribution > 0 ? "+" : ""}{ev.contribution.toFixed(2)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {ev.positions_impacted.map(p => (
                    <span key={p} className="text-xs bg-muted px-1 py-0.5 rounded font-mono">{p}</span>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {ev.archetypes_impacted.slice(0, 2).map(a => (
                    <span key={a} className="text-xs bg-muted px-1 py-0.5 rounded">{a}</span>
                  ))}
                  {ev.archetypes_impacted.length > 2 && (
                    <span className="text-xs text-muted-foreground">+{ev.archetypes_impacted.length - 2}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{ev.explanation}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
