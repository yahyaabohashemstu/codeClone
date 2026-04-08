export interface UserSummary {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface AiHealth {
  provider: string;
  model: string;
  status: string;
  live_check?: boolean;
  message: string;
  sample_response?: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user: UserSummary | null;
  csrfToken: string;
  supportedLanguages: string[];
  ai: AiHealth | null;
}

export interface HomeResponse {
  totalAnalyses: number;
  userAnalyses: number;
  languagesSupported: number;
  latestAnalysisId: number | null;
  latestAnalysisSummary: HistorySummary | null;
  supportedLanguages: string[];
}

export interface HistorySummary {
  id: number;
  operation: string;
  result: string;
  language: string;
  similarity: number;
  severity: "high" | "moderate" | "low";
  dateCreated: string | null;
  dateDisplay: string;
  sourceA: string;
  sourceB: string;
}

export interface SimilarityItem {
  name: string;
  value: number;
}

export interface CloneItem {
  name: string;
  detected: boolean;
}

export interface SourceLabels {
  code1: string;
  code2: string;
}

export interface CodeSmellResult {
  code1_analysis: string;
  code2_analysis: string;
}

export interface StructuredFinding {
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
}

export interface StructuredReport {
  verdict: string;
  risk_level: "critical" | "high" | "moderate" | "low" | "none";
  summary: string;
  findings: StructuredFinding[];
  refactoring_suggestion: string;
  report: string;
}

export interface AnalysisResult {
  language: string;
  supported_languages: string[];
  code1: string;
  code2: string;
  source_labels: SourceLabels;
  description_list1: string;
  description_list2: string;
  similarity_items: SimilarityItem[];
  clone_items: CloneItem[];
  chart_url: string | null;
  graph_json1: unknown;
  graph_json2: unknown;
  metrics1: Record<string, unknown>;
  metrics2: Record<string, unknown>;
  analysis_text: string;
  analysis_html: string;
  analysis_structured: StructuredReport | null;
  excel_analysis_results: unknown[];
  code_smell: CodeSmellResult;
  similarities: Record<string, unknown> | null;
  error_message: string | null;
  has_results: boolean;
  saved_analysis_id: number | null;
  summary?: HistorySummary;
}

export interface AnalysisProgressResponse {
  stage: string;
  progress: number | null;
  timestamp: string;
  taskId?: string;
  taskStatus?: "running" | "completed" | "failed";
}

export interface HistoryResponse {
  items: HistorySummary[];
  stats: {
    totalAnalyses: number;
    highSimilarity: number;
    languagesUsed: number;
    last7Days: number;
  };
}
