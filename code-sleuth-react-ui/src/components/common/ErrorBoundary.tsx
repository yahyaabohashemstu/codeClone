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

/**
 * Last-resort fault panel. It renders outside the i18n provider, so the copy
 * is inlined for both surfaces; the styling is the bench fault panel used by
 * PageError (hairline panel, lit lamp, secondary + primary actions).
 */
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
        <div className="flex min-h-[60vh] items-center justify-center p-6" role="alert">
          <div className="w-full max-w-md border border-bench-hair bg-bench-raised">
            <div className="flex items-center gap-2.5 border-b border-bench-hair px-5 py-3">
              <span aria-hidden className="lamp is-on" />
              <h2 className="label text-txt-primary">{isArabic ? "حدث خطأ غير متوقع" : "Something went wrong"}</h2>
            </div>
            <div className="px-5 py-4">
              <p className="body-lg text-txt-secondary">
                {isArabic
                  ? "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى أو تحديث الصفحة."
                  : "An unexpected error occurred. Please try again or refresh the page."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={this.handleReset} className="btn btn-secondary h-9 px-3.5 text-[13px]">
                  {isArabic ? "حاول مرة أخرى" : "Try again"}
                </button>
                <button type="button" onClick={() => window.location.reload()} className="btn btn-primary h-9 px-3.5 text-[13px]">
                  {isArabic ? "تحديث الصفحة" : "Refresh page"}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
