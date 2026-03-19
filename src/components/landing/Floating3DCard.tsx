import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";

interface Floating3DCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  floatAmplitude?: number;
  floatDuration?: number;
  initialRotateX?: number;
  initialRotateY?: number;
  onClick?: () => void;
}

export function Floating3DCard({
  children,
  className = "",
  delay = 0,
  floatAmplitude = 10,
  floatDuration = 6,
  initialRotateX = 8,
  initialRotateY = -12,
  onClick,
}: Floating3DCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [initialRotateX + 8, initialRotateX - 8]), {
    stiffness: 150,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [initialRotateY - 8, initialRotateY + 8]), {
    stiffness: 150,
    damping: 20,
  });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={`cursor-pointer ${className}`}
      style={{
        perspective: 1200,
        transformStyle: "preserve-3d",
      }}
      initial={{ opacity: 0, y: 60, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 1, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <motion.div
        className="relative w-full h-full rounded-2xl overflow-hidden border border-border/30 bg-card/40 backdrop-blur-xl shadow-2xl shadow-primary/5 transition-shadow duration-500 hover:shadow-primary/15 hover:border-primary/30"
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        animate={{
          y: [-floatAmplitude, floatAmplitude, -floatAmplitude],
        }}
        transition={{
          y: {
            duration: floatDuration,
            repeat: Infinity,
            ease: "easeInOut",
          },
        }}
      >
        {/* Glass reflection */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none z-20"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--foreground)) 0%, transparent 40%, transparent 60%, hsl(var(--foreground) / 0.03) 100%)",
          }}
        />

        {/* Top bar - fake window chrome */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/20 bg-background/40">
          <div className="w-[5px] h-[5px] rounded-full bg-destructive/50" />
          <div className="w-[5px] h-[5px] rounded-full bg-gold/50" />
          <div className="w-[5px] h-[5px] rounded-full bg-primary/50" />
        </div>

        {/* Screen content */}
        <div className="relative z-10">{children}</div>

        {/* Bottom glow */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
      </motion.div>
    </motion.div>
  );
}
