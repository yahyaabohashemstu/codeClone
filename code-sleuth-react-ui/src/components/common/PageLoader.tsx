import { useTranslation } from "react-i18next";
import { ScaleTicks } from "@/components/bench/Bench";

interface PageLoaderProps {
  message?: string;
}

/**
 * The instrument settling: a short engraved scale with the needle sweeping
 * across it while the reading is taken. The sweep is gated behind
 * `motion-safe`, and the global reduced-motion contract in index.css collapses
 * it as well, so a reader who asked for stillness sees a static scale.
 */
export function PageLoader({ message }: PageLoaderProps) {
  const { t } = useTranslation("common");
  const label = message ?? t("status.loading");

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <style>{`@keyframes bench-loader-sweep{from{inset-inline-start:0}to{inset-inline-start:calc(100% - 2px)}}`}</style>
      <div aria-hidden className="scale w-[240px]">
        <ScaleTicks />
        <span className="scale-needle motion-safe:[animation:bench-loader-sweep_1.4s_cubic-bezier(0.65,0,0.35,1)_infinite_alternate]" />
      </div>
      <p className="mono-meta text-txt-muted">{label}</p>
    </div>
  );
}
