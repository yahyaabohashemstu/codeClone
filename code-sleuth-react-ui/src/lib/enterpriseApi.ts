import { apiFetch } from "@/lib/api";
import type {
  CaseSeverity,
  CaseStatus,
  EnterpriseCase,
  EnterpriseRepository,
  EnterpriseScanJob,
  EnterpriseWorkspace,
  FeedbackLabel,
  RepositorySecrets,
  WorkspaceMembership,
} from "@/types/enterprise";

const BASE = "/api/enterprise/v1";

// ── Organizations & workspaces ─────────────────────────────────────────────

export interface EnterpriseOrganization {
  id: number;
  slug: string;
  name: string;
  storageRegion: string;
  createdByLegacyUserId: number | null;
  createdAt: string | null;
}

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  storageRegion?: string;
}

export interface CreateWorkspaceInput {
  organizationId: number;
  name: string;
  slug?: string;
  description?: string;
  storageRegion?: string;
  defaultSimilarityThreshold?: number;
  semanticThreshold?: number;
}

export async function listOrganizations(): Promise<EnterpriseOrganization[]> {
  const res = await apiFetch<{ success: boolean; items: EnterpriseOrganization[] }>(`${BASE}/organizations`);
  return res.items ?? [];
}

export async function createOrganization(input: CreateOrganizationInput): Promise<EnterpriseOrganization> {
  const res = await apiFetch<{ success: boolean; item: EnterpriseOrganization }>(`${BASE}/organizations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.item;
}

export async function listWorkspaces(): Promise<EnterpriseWorkspace[]> {
  const res = await apiFetch<{ success: boolean; items: EnterpriseWorkspace[] }>(`${BASE}/workspaces`);
  return res.items ?? [];
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<EnterpriseWorkspace> {
  const res = await apiFetch<{ success: boolean; item: EnterpriseWorkspace }>(`${BASE}/workspaces`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.item;
}

// ── Members ────────────────────────────────────────────────────────────────

export interface AddMemberInput {
  legacyUserId: number;
  // Plain string: caller form state is a string; the backend validates the role.
  role: string;
}

export async function listMembers(workspaceId: number): Promise<WorkspaceMembership[]> {
  const res = await apiFetch<{ success: boolean; items: WorkspaceMembership[] }>(
    `${BASE}/workspaces/${workspaceId}/members`,
  );
  return res.items ?? [];
}

export async function addMember(workspaceId: number, input: AddMemberInput): Promise<WorkspaceMembership> {
  const res = await apiFetch<{ success: boolean; item: WorkspaceMembership }>(
    `${BASE}/workspaces/${workspaceId}/members`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return res.item;
}

// ── Repositories & scans ───────────────────────────────────────────────────

export interface CreateRepositoryInput {
  name: string;
  // Kept as a plain string: the caller's form state is a string and the backend
  // validates/normalizes the provider value.
  provider: string;
  localPath?: string;
  cloneUrl?: string;
  defaultBranch?: string;
  externalId?: string;
  declaredRegion?: string;
}

export interface GitProbeResult {
  branches: string[];
  defaultBranch: string;
  totalBranches: number;
}

export async function listRepositories(workspaceId: number): Promise<EnterpriseRepository[]> {
  const res = await apiFetch<{ success: boolean; items: EnterpriseRepository[] }>(
    `${BASE}/workspaces/${workspaceId}/repositories`,
  );
  return res.items ?? [];
}

export async function createRepository(
  workspaceId: number,
  input: CreateRepositoryInput,
): Promise<{ item: EnterpriseRepository; secrets: RepositorySecrets }> {
  return apiFetch<{ item: EnterpriseRepository; secrets: RepositorySecrets }>(
    `${BASE}/workspaces/${workspaceId}/repositories`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

/** Probe a git URL (server-side `git ls-remote`) to discover branches. */
export async function probeGitUrl(workspaceId: number, cloneUrl: string): Promise<GitProbeResult> {
  return apiFetch<GitProbeResult>(`${BASE}/git/probe`, {
    method: "POST",
    body: JSON.stringify({ workspaceId, cloneUrl }),
  });
}

export async function triggerScan(
  repositoryId: number,
  input: { branch?: string; commitSha?: string } = {},
): Promise<EnterpriseScanJob> {
  const res = await apiFetch<{ success: boolean; item: EnterpriseScanJob }>(
    `${BASE}/repositories/${repositoryId}/scans`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return res.item;
}

export async function getScanJob(scanJobId: number): Promise<EnterpriseScanJob> {
  const res = await apiFetch<{ success: boolean; item: EnterpriseScanJob }>(`${BASE}/scan-jobs/${scanJobId}`);
  return res.item;
}

// ── Review cases ───────────────────────────────────────────────────────────

export interface UpdateCaseInput {
  status?: CaseStatus;
  severity?: CaseSeverity;
  resolutionLabel?: string;
  resolutionNotes?: string;
  assignedToLegacyUserId?: number;
}

export interface FeedbackInput {
  label: FeedbackLabel;
  notes?: string;
  confidenceOverride?: number;
}

export async function listCases(workspaceId: number, status?: string): Promise<EnterpriseCase[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiFetch<{ success: boolean; items: EnterpriseCase[] }>(
    `${BASE}/workspaces/${workspaceId}/cases${query}`,
  );
  return res.items ?? [];
}

export async function getCase(caseId: number): Promise<EnterpriseCase> {
  const res = await apiFetch<{ success: boolean; item: EnterpriseCase }>(`${BASE}/cases/${caseId}`);
  return res.item;
}

export async function updateCase(caseId: number, patch: UpdateCaseInput): Promise<EnterpriseCase> {
  const res = await apiFetch<{ success: boolean; item: EnterpriseCase }>(`${BASE}/cases/${caseId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.item;
}

export async function submitFeedback(caseId: number, input: FeedbackInput): Promise<EnterpriseCase> {
  const res = await apiFetch<{ success: boolean; item: EnterpriseCase }>(`${BASE}/cases/${caseId}/feedback`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.item;
}

/** URL for the server-generated PDF report of a case (opened in a new tab). */
export function getCasePdfUrl(caseId: number): string {
  return `${BASE}/cases/${caseId}/report.pdf`;
}
