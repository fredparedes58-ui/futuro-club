import { motion } from "framer-motion";
import { item } from "./labUi";

interface LabStatusBarProps {
  isProcessing: boolean;
  pipelineStep: string;
  mediaPipeStatus: string;
  mediaPipeFps: number;
  mediaPipeFramesProcessed: number;
  totalEvents?: number;
}

/** Barra de estado inferior del laboratorio (GPU / MediaPipe / engine). Presentacional puro. */
const LabStatusBar = ({
  isProcessing,
  pipelineStep,
  mediaPipeStatus,
  mediaPipeFps,
  mediaPipeFramesProcessed,
  totalEvents,
}: LabStatusBarProps) => (
  <motion.div variants={item} className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] font-display text-muted-foreground tracking-wider">
    <div className="flex items-center gap-6">
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${isProcessing ? "bg-yellow-400 animate-pulse" : "bg-primary"}`} />
        {isProcessing ? `PIPELINE: ${pipelineStep.toUpperCase()}` : "GPU_READY"}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${mediaPipeStatus === "processing" ? "bg-green-400 animate-pulse" : mediaPipeStatus === "complete" ? "bg-green-400" : "bg-muted-foreground"}`} />
        MEDIAPIPE: {mediaPipeStatus === "processing" ? `${mediaPipeFps}FPS` : mediaPipeStatus === "complete" ? `DONE·${mediaPipeFramesProcessed}f` : "STANDBY"}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        ENGINE: YOLO+MediaPipe{totalEvents !== undefined ? ` · ${totalEvents}evt` : ""}
      </span>
    </div>
    <span>VITAS_STATION_004 // BUILD_3.0.0</span>
  </motion.div>
);

export default LabStatusBar;
