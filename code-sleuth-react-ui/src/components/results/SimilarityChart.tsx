
import { useEffect, useRef } from "react";
import { SimilarityResult } from "@/context/AnalysisContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SimilarityChartProps {
  results: SimilarityResult[];
}

export function SimilarityChart({ results }: SimilarityChartProps) {
  const chartData = results.map((result) => ({
    name: `${result.file1} & ${result.file2}`,
    similarity: Math.round(result.similarityScore * 100),
    token: Math.round(result.tokenSimilarity * 100),
    graph: Math.round(result.graphSimilarity * 100),
    ai: Math.round(result.aiSimilarity * 100),
    id: result.id,
  }));

  const colorScale = (value: number) => {
    if (value >= 90) return "#EF4444"; // High similarity - red
    if (value >= 70) return "#F97316"; // Medium-high similarity - orange
    if (value >= 50) return "#FBBF24"; // Medium similarity - yellow
    return "#10B981"; // Low similarity - green
  };

  return (
    <Card className="analysis-card">
      <CardHeader className="pb-2">
        <CardTitle>Code Similarity Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                style={{ fontSize: "0.75rem" }}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, "Similarity"]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  borderColor: "var(--color-border)",
                  borderRadius: "0.5rem",
                }}
              />
              <Legend />
              <Bar dataKey="similarity" name="Overall Similarity" radius={[0, 4, 4, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.id} fill={colorScale(entry.similarity)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
