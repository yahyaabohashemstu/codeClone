// ──────────────────────────────────────────────
// Enterprise platform TypeScript types
// Mirrors the serializers in enterprise_platform/services.py
// ──────────────────────────────────────────────

export interface WorkspaceMembership {
  id: number;
  workspaceId: number;
  legacyUserId: number;
  role: "student" | "reviewer" | "manager" | "admin" | "owner";
  isActive: boolean;
  createdAt: string | null;
  lastActiveAt: string | null;
}

export interface EnterpriseWorkspace {
  id: number;
  organizationId: number;
  slug: string;
  name: string;
  description: string | null;
  storageRegion: string;
  defaultSimilarityThreshold: number;
  semanticThreshold: number;
  createdByLegacyUserId: number | null;
  createdAt: string | null;
  archivedAt: string | null;
  membership: WorkspaceMembership | null;
}

export interface EnterpriseRepository {
  id: number;
  workspaceId: number;
  provider: "local" | "github" | "gitlab";
  externalId: string | null;
  name: string;
  defaultBranch: string | null;
  declaredRegion: string;
  createdByLegacyUserId: number | null;
  createdAt: string | null;
  lastWebhookAt: string | null;
}

export interface RepositorySecrets {
  webhookSecret: string;
  githubWebhookUrl: string;
  gitlabWebhookUrl: string;
}

export type ScanJobStatus = "queued" | "claimed" | "running" | "completed" | "failed";

export interface ScanJobMetrics {
  filesScanned?: number;
  artifactsCreated?: number;
  matchesCreated?: number;
  casesCreated?: number;
}

export interface EnterpriseScanJob {
  id: number;
  workspaceId: number;
  repositoryId: number;
  snapshotId: number | null;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  status: ScanJobStatus;
  requestedByLegacyUserId: number | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  metrics: ScanJobMetrics;
  snapshot?: {
    id: number;
    commitSha: string | null;
    branch: string | null;
    fileCount: number;
    status: string;
    scannedAt: string | null;
  } | null;
}

export interface CodeArtifact {
  id: number;
  workspaceId: number;
  repositoryId: number;
  snapshotId: number;
  logicalPath: string;
  language: string;
  languageFamily: string;
  symbolName: string | null;
  symbolQualifiedName: string | null;
  symbolKind: string;
  startLine: number;
  endLine: number;
  tokenCount: number;
  normalizedHash: string;
  rawSha256: string;
  storageRegion: string;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  rawSource?: string;
  canonicalSource?: string;
}

export interface SimilarityMatch {
  id: number;
  workspaceId: number;
  snapshotId: number;
  artifactA: CodeArtifact;
  artifactB: CodeArtifact;
  similarityScore: number;
  structuralScore: number;
  semanticScore: number;
  tokenScore: number;
  cloneType: string;
  isCrossLanguage: boolean;
  evidence: {
    location?: {
      artifactA: { path: string; startLine: number; endLine: number };
      artifactB: { path: string; startLine: number; endLine: number };
    };
    summary?: {
      semanticScore: number;
      tokenScore: number;
      structuralScore: number;
      similarityScore: number;
      cloneType: string;
      isCrossLanguage: boolean;
    };
    sharedTokens?: string[];
  };
  createdAt: string | null;
}

export interface ReviewEvidence {
  id: number;
  artifactId: number | null;
  evidenceType: string;
  title: string;
  payload: Record<string, unknown>;
  createdAt: string | null;
}

export type CaseStatus =
  | "open"
  | "in_review"
  | "confirmed_clone"
  | "false_positive"
  | "dismissed"
  | "resolved";

export type CaseSeverity = "critical" | "high" | "medium" | "low";

export interface EnterpriseCase {
  id: number;
  workspaceId: number;
  repositoryId: number | null;
  snapshotId: number | null;
  match: SimilarityMatch;
  policyRuleId: number | null;
  status: CaseStatus;
  severity: CaseSeverity;
  cloneType: string;
  confidenceScore: number;
  assignedToLegacyUserId: number | null;
  createdByLegacyUserId: number | null;
  resolutionLabel: string | null;
  resolutionNotes: string | null;
  reviewerFeedback: string | null;
  evidence: ReviewEvidence[];
  createdAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
}

export interface WorkspaceAnalytics {
  artifacts: number;
  matches: number;
  repositories: number;
  clusters: Array<{
    size: number;
    artifactIds: number[];
    paths: string[];
    links: Array<{ artifactAId: number; artifactBId: number; weight: number }>;
  }>;
  heatmap: {
    repositories: string[];
    matrix: Array<{ repository: string; scores: number[] }>;
  };
  similaritySpread: Array<{ bucket: string; count: number }>;
  cloneTypes: Array<{ cloneType: string; count: number }>;
}

export type FeedbackLabel =
  | "confirmed_clone"
  | "confirmed_plagiarism"
  | "false_positive"
  | "benign_similarity"
  | "needs_more_review";
