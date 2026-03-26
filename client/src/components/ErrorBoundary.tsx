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
          <div className="flex flex-col items-center w-full max-w-2xl p-8 rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
            <AlertTriangle
              size={48}
              className="text-[#DC2626] mb-6 flex-shrink-0"
            />

            <h2 className="headline-sm text-[#1A1A18] mb-4">{i18n.t("errorBoundary.title")}</h2>

            <div className="p-4 w-full rounded-md bg-[#F5F1EB] overflow-auto mb-6 border border-[#E8E4DC]">
              <pre className="text-sm text-[#6B6860] whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-8 py-3.5 rounded-full min-h-[48px]",
                "bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase",
                "hover:bg-[#333330] transition-colors cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              {i18n.t("errorBoundary.reload")}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
