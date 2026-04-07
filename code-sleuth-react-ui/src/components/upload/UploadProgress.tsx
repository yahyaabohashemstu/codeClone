
import { useAnalysis } from "@/context/AnalysisContext";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function UploadProgress() {
  const { uploadStatus } = useAnalysis();
  const { status, progress, message } = uploadStatus;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === "uploading" && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {status === "success" && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {status === "error" && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          <p className={cn(
            "text-sm font-medium",
            status === "success" && "text-green-500",
            status === "error" && "text-destructive"
          )}>
            {status === "uploading" && "Uploading..."}
            {status === "success" && "Upload complete"}
            {status === "error" && "Upload failed"}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{progress}%</span>
      </div>
      
      <Progress value={progress} className="h-2" />
      
      {message && (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
