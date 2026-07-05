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

// ── Platform admin ─────────────────────────────────────────────────────────

export interface AdminMetrics {
  totalUsers: number;
  totalAnalyses: number;
  verifiedUsers: number;
  twofaUsers: number;
  planCounts: Record<string, number>;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
  twofaEnabled: boolean;
  isAdmin: boolean;
  plan: string;
  createdAt: string | null;
}

export interface AdminUsersPage {
  items: AdminUser[];
  total: number;
  page: number;
  perPage: number;
}

/** Platform-wide counts for the admin dashboard. */
export async function getAdminMetrics(): Promise<AdminMetrics> {
  return apiFetch<AdminMetrics>("/api/v1/admin/metrics");
}

/** Paginated user list with each user's current plan. */
export async function getAdminUsers(page = 1): Promise<AdminUsersPage> {
  return apiFetch<AdminUsersPage>(`/api/v1/admin/users?page=${page}`);
}

/** Set a user's subscription plan (admin action). */
export async function setUserPlan(userId: number, plan: string): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${userId}/plan`, {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}
