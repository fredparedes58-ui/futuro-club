import { Button } from "@/components/ui/button";
import { Eye, BarChart3 } from "lucide-react";

export type ViewMode = "scout" | "analyst";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ViewModeToggle({ mode, onChange }: Props) {
  return (
    <div className="inline-flex items-center bg-muted rounded-md p-0.5">
      <Button
        variant={mode === "scout" ? "default" : "ghost"}
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => onChange("scout")}
      >
        <Eye className="w-3.5 h-3.5" />
        Scout
      </Button>
      <Button
        variant={mode === "analyst" ? "default" : "ghost"}
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => onChange("analyst")}
      >
        <BarChart3 className="w-3.5 h-3.5" />
        Analista
      </Button>
    </div>
  );
}
