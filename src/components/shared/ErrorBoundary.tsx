import React, { Component, ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-danger" />
          </div>
          <h2 className="font-display text-xl font-bold mb-2">Algo salió mal</h2>
          <p className="text-sm text-muted-foreground mb-1 max-w-md">
            Se produjo un error inesperado. Puedes intentar recargar el módulo.
          </p>
          <p className="text-xs font-mono text-muted-foreground/60 mb-4 max-w-md truncate">
            {this.state.error?.message}
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
