import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isArabic = document.documentElement.lang === "ar" || document.documentElement.dir === "rtl";

      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8" role="alert">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center max-w-md">
            <h2 className="font-display text-lg font-semibold text-destructive mb-2">
              {isArabic ? "حدث خطأ غير متوقع" : "Something went wrong"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {isArabic
                ? "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى أو تحديث الصفحة."
                : "An unexpected error occurred. Please try again or refresh the page."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                {isArabic ? "حاول مرة أخرى" : "Try Again"}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {isArabic ? "تحديث الصفحة" : "Refresh Page"}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
