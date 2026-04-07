
import { SimilarityChart } from "./SimilarityChart";
import { MetricsTable } from "./MetricsTable";
import { useAnalysis, mockSimilarityResults, mockMetricsResults } from "@/context/AnalysisContext";
import { ArrowDownToLine, BarChart2, Table as TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function ResultsDisplay() {
  const { similarityResults, metricsResults, uploadStatus } = useAnalysis();
  const { toast } = useToast();
  
  // Use mock data if no real data is available
  const displaySimilarityResults = similarityResults.length > 0 ? similarityResults : mockSimilarityResults;
  const displayMetricsResults = metricsResults.length > 0 ? metricsResults : mockMetricsResults;

  const handleExport = (type: "csv" | "json" | "pdf") => {
    toast({
      title: "Export started",
      description: `Exporting results as ${type.toUpperCase()}...`,
    });
    
    // Simulate export delay
    setTimeout(() => {
      toast({
        title: "Export complete",
        description: `Results have been exported as ${type.toUpperCase()}`,
      });
    }, 1500);
  };

  if (uploadStatus.status !== "success" && similarityResults.length === 0) {
    return (
      <Card className="flex h-[500px] items-center justify-center">
        <CardContent className="text-center">
          <BarChart2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No analysis results yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload code files to see analysis results
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Analysis Results</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
          <Button onClick={() => handleExport("pdf")}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Export PDF Report
          </Button>
        </div>
      </div>

      <SimilarityChart results={displaySimilarityResults} />
      
      <MetricsTable metrics={displayMetricsResults} />
    </div>
  );
}
