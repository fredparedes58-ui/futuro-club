import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  rightContent?: React.ReactNode;
}

const PageHeader = ({ title, subtitle, backTo = "/", rightContent }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center justify-between gap-3 mb-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => navigate(backTo)}
          className="shrink-0 p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors active:scale-95"
          aria-label="Volver"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-lg text-foreground truncate">{title}</h1>
          {subtitle && (
            <p className="text-[10px] font-display text-muted-foreground uppercase tracking-wider truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {rightContent && <div className="shrink-0">{rightContent}</div>}
    </motion.div>
  );
};

export default PageHeader;
