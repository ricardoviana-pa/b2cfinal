import { cn } from "@/lib/utils";
import i18n from "@/i18n";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-[#FAFAF7]">
          <div className="flex flex-col items-center w-full max-w-md p-10 text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F1EB]">
              <AlertTriangle size={24} className="text-[#9E9A90]" />
            </div>

            <h2 className="headline-sm text-[#1A1A18] mb-3">{i18n.t("errorBoundary.title", "Something went wrong")}</h2>
            <p className="body-md mb-8" style={{ color: '#6B6860' }}>
              {i18n.t("errorBoundary.body", "Please try again. If the problem persists, contact our team.")}
            </p>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-8 py-3.5 rounded-full min-h-[48px]",
                "bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase",
                "hover:bg-[#333330] transition-colors cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              {i18n.t("errorBoundary.reload", "Try again")}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
