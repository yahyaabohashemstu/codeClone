import { apiFetch } from "@/lib/api";

// ── Per-user API keys ──────────────────────────────────────────────────────

/** A per-user API key as returned by the backend (never includes the secret). */
export interface ApiKeyRow {
  id: number;
  name: string | null;
  prefix: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
}

/** List the caller's API keys (most recent first). */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const res = await apiFetch<{ success: boolean; items: ApiKeyRow[] }>("/api/v1/api-keys");
  return res.items ?? [];
}

/**
 * Create a new API key. The full plaintext `token` is returned exactly once —
 * the caller must surface it immediately; it cannot be retrieved again.
 */
export async function createApiKey(name: string): Promise<{ token: string; item: ApiKeyRow }> {
  return apiFetch<{ token: string; item: ApiKeyRow }>("/api/v1/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/** Revoke an API key by id. */
export async function revokeApiKey(id: number): Promise<void> {
  await apiFetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
}

/** Current-period API usage + the caller's SEPARATE API subscription. */
export interface ApiUsage {
  apiPlan: string;
  apiPlanName: string;
  status: string;
  period: string;
  calls: number;
  pairs: number;
  includedPairs: number;
  remainingIncluded: number;
  overagePairs: number;
  allowsOverage: boolean;
  hardCapped: boolean;
  atLimit: boolean;
  ratePer1000Cents: number;
  monthlyPriceCents: number;
  estimatedCostCents: number;
  currentPeriodEnd: string | null;
  lastCallAt: string | null;
}

/** One tier on the API's own pricing ladder. */
export interface ApiPlanInfo {
  code: string;
  name: string;
  monthlyPairsIncluded: number;
  priceCents: number;
  overageCentsPer1000: number;
  allowsOverage: boolean;
}

/** Fetch the caller's current-period API usage and estimated cost. */
export async function getApiUsage(): Promise<ApiUsage> {
  return apiFetch<ApiUsage>("/api/v1/api-keys/usage");
}

/** Fetch the API pricing ladder + the caller's current API subscription. */
export async function getApiPlans(): Promise<{ plans: ApiPlanInfo[]; current: ApiUsage; billingEnabled: boolean }> {
  return apiFetch("/api/v1/api-keys/plans");
}

/** Start a Stripe Checkout for a paid API plan. Throws on 503 (not configured). */
export async function startApiCheckout(plan: string): Promise<{ checkoutUrl?: string }> {
  return apiFetch("/api/v1/api-keys/checkout", { method: "POST", body: JSON.stringify({ plan }) });
}

/** Open the Stripe billing portal for the API subscription. Throws on 503. */
export async function openApiPortal(): Promise<{ portalUrl?: string }> {
  return apiFetch("/api/v1/api-keys/portal", { method: "POST" });
}

// ── Platform admin ─────────────────────────────────────────────────────────

export interface AdminMetrics {
  totalUsers: number;
  totalAnalyses: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  twofaUsers: number;
  adminUsers: number;
  lockedUsers: number;
  failedLogins24h: number;
  planCounts: Record<string, number>;
  apiPlanCounts: Record<string, number>;
  subStatusCounts: Record<string, number>;
  estimatedMrrCents: number;
  signups: { today: number; last7d: number; last30d: number };
}

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
  twofaEnabled: boolean;
  isAdmin: boolean;
  plan: string;
  status: string;
  createdAt: string | null;
  lastActive: string | null;
  locked: boolean;
  usageUsed: number;
  usageLimit: number;
  usagePct: number | null;
}

export interface AdminUsersPage {
  items: AdminUser[];
  total: number;
  page: number;
  perPage: number;
}

export interface AuditRow {
  id: number;
  userId: number | null;
  action: string;
  detail: string | null;
  createdAt: string | null;
}

export interface AdminUserDetail {
  user: {
    id: number; username: string; email: string | null;
    emailVerified: boolean; twofaEnabled: boolean; isAdmin: boolean;
    active: boolean;
    createdAt: string | null; failedLoginCount: number;
    lockedUntil: string | null; locked: boolean; sessionVersion: number;
    lastLoginAt: string | null;
  };
  subscription: {
    plan: string; status: string;
    stripeCustomerId: string | null; stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
  };
  quota: Record<string, unknown>;
  apiUsage: ApiUsage;
  apiKeys: ApiKeyRow[];
  activity: {
    analysesCount: number; lastAnalysisAt: string | null;
    avgSimilarity: number | null; languages: Record<string, number>;
  };
}

export interface AdminRevenue {
  estimated: boolean;
  estimatedMrrCents: number;
  estimatedUsageRevenueCents: number;
  basePlans: { code: string; name: string; subscribers: number; priceCents: number; monthlyCents: number }[];
  apiPlans: { code: string; name: string; subscribers: number; priceCents: number; monthlyCents: number }[];
  subStatusCounts: Record<string, number>;
  pastDue: number;
  canceled: number;
}

export interface AdminUsage {
  period: string;
  interactiveAnalyses: number;
  apiCalls: number;
  apiPairs: number;
  topInteractive: { userId: number; username: string; analyses: number }[];
  topApi: { userId: number; username: string; calls: number; pairs: number; lastCallAt: string | null }[];
  nearQuotaUsers: number;
  overQuotaUsers: number;
  apiPlanMix: Record<string, number>;
  note: string;
}

export interface AdminActivity {
  days: number;
  signupsPerDay: { date: string; count: number }[];
  analysesPerDay: { date: string; count: number }[];
  activeUsersPerDay: { date: string; count: number }[];
}

export interface AdminDistributions {
  languages: { language: string; count: number }[];
  similarity: { range: string; count: number }[];
}

export interface AdminSecurity {
  lockedCount: number;
  lockedAccounts: { id: number; username: string; failedLoginCount: number; lockedUntil: string | null }[];
  failedLogins24h: number;
  twofaUsers: number;
  adminUsers: number;
  dormantApiKeys: number;
  revokedApiKeys: number;
  recentAdminActions: AuditRow[];
}

export interface AdminUsersQuery {
  page?: number;
  q?: string;
  plan?: string;
  status?: string;
  verified?: string;
  locked?: string;
  sortBy?: string;
  order?: string;
}

/** Platform-wide KPIs for the admin overview. */
export async function getAdminMetrics(): Promise<AdminMetrics> {
  return apiFetch<AdminMetrics>("/api/v1/admin/metrics");
}

/** Searchable / filterable / sortable user list, enriched per row. */
export async function getAdminUsers(query: AdminUsersQuery = {}): Promise<AdminUsersPage> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && `${v}` !== "") params.set(k, `${v}`);
  });
  const qs = params.toString();
  return apiFetch<AdminUsersPage>(`/api/v1/admin/users${qs ? `?${qs}` : ""}`);
}

/** Per-user 360 detail. */
export async function getAdminUserDetail(userId: number): Promise<AdminUserDetail> {
  return apiFetch<AdminUserDetail>(`/api/v1/admin/users/${userId}`);
}

/** One user's audit history. */
export async function getAdminUserAudit(userId: number, limit = 50): Promise<AuditRow[]> {
  const res = await apiFetch<{ items: AuditRow[] }>(`/api/v1/admin/users/${userId}/audit?limit=${limit}`);
  return res.items ?? [];
}

/** Recent global audit entries (optionally filtered). */
export async function getAdminAudit(opts: { limit?: number; userId?: number; action?: string } = {}): Promise<AuditRow[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", `${opts.limit}`);
  if (opts.userId) params.set("userId", `${opts.userId}`);
  if (opts.action) params.set("action", opts.action);
  const qs = params.toString();
  const res = await apiFetch<{ items: AuditRow[] }>(`/api/v1/admin/audit${qs ? `?${qs}` : ""}`);
  return res.items ?? [];
}

export async function getAdminRevenue(): Promise<AdminRevenue> {
  return apiFetch<AdminRevenue>("/api/v1/admin/revenue");
}

export async function getAdminUsage(): Promise<AdminUsage> {
  return apiFetch<AdminUsage>("/api/v1/admin/usage");
}

export async function getAdminActivity(days = 30): Promise<AdminActivity> {
  return apiFetch<AdminActivity>(`/api/v1/admin/activity/timeseries?days=${days}`);
}

export async function getAdminDistributions(): Promise<AdminDistributions> {
  return apiFetch<AdminDistributions>("/api/v1/admin/activity/distributions");
}

export async function getAdminSecurity(): Promise<AdminSecurity> {
  return apiFetch<AdminSecurity>("/api/v1/admin/security");
}

/** Set a user's subscription plan (admin action). */
export async function setUserPlan(userId: number, plan: string): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/plan`, {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

// ── Admin actions (mutating) ─────────────────────────────────────────────────

export async function setUserApiPlan(userId: number, plan: string): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/api-plan`, { method: "POST", body: JSON.stringify({ plan }) });
}
export async function lockUser(userId: number, minutes = 60): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/lock`, { method: "POST", body: JSON.stringify({ minutes }) });
}
export async function unlockUser(userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/unlock`, { method: "POST" });
}
export async function suspendUser(userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/suspend`, { method: "POST" });
}
export async function unsuspendUser(userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/unsuspend`, { method: "POST" });
}
export async function resetUser2fa(userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/reset-2fa`, { method: "POST" });
}
export async function resendUserVerification(userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/resend-verification`, { method: "POST" });
}
export async function logoutUserEverywhere(userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/logout-all`, { method: "POST" });
}
export async function setUserAdmin(userId: number, isAdmin: boolean): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/admin`, { method: "POST", body: JSON.stringify({ isAdmin }) });
}
export async function resetUserQuota(userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/reset-quota`, { method: "POST" });
}
export async function deleteUser(userId: number): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}`, { method: "DELETE" });
}

/** Same-origin URL for the users CSV export (GET, cookie-authenticated). */
export const ADMIN_USERS_CSV_URL = "/api/v1/admin/users/export.csv";
export const API_PLAN_CODES = ["api_free", "api_starter", "api_growth", "api_scale"];
