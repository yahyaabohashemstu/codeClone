
import { MetricsResult } from "@/context/AnalysisContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MetricsTableProps {
  metrics: MetricsResult[];
}

export function MetricsTable({ metrics }: MetricsTableProps) {
  return (
    <Card className="analysis-card">
      <CardHeader className="pb-2">
        <CardTitle>Code Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead className="text-right">Lines of Code</TableHead>
                <TableHead className="text-right">Complexity</TableHead>
                <TableHead className="text-right">Functions</TableHead>
                <TableHead className="text-right">Classes</TableHead>
                <TableHead className="text-right">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric) => (
                <TableRow key={metric.id}>
                  <TableCell className="font-medium">{metric.fileName}</TableCell>
                  <TableCell className="text-right">{metric.linesOfCode}</TableCell>
                  <TableCell className="text-right">{metric.complexity}</TableCell>
                  <TableCell className="text-right">{metric.functions}</TableCell>
                  <TableCell className="text-right">{metric.classes}</TableCell>
                  <TableCell className="text-right">{metric.comments}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
