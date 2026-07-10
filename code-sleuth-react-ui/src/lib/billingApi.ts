import { apiFetch } from "@/lib/api";

export interface BillingPlan {
  code: string;
  name: string;
  monthlyAnalysisQuota: number;
  unlimited: boolean;
  priceCents: number;
}

export interface BillingSummary {
  plan: string;
  planName: string;
  status: string;
  period: string;
  used: number;
  limit: number;
  unlimited: boolean;
  remaining: number | null;
  currentPeriodEnd: string | null;
  billingEnabled: boolean;
}

/** Current user's plan + this period's usage. */
export async function getBillingSummary(): Promise<BillingSummary> {
  return apiFetch<BillingSummary>("/api/v1/billing/summary");
}

/** Public list of plans plus whether Stripe checkout is actually configured. */
export async function getPlans(): Promise<{ plans: BillingPlan[]; billingEnabled: boolean }> {
  const res = await apiFetch<{ success: boolean; plans: BillingPlan[]; billingEnabled: boolean }>(
    "/api/v1/billing/plans",
  );
  return { plans: res.plans ?? [], billingEnabled: Boolean(res.billingEnabled) };
}

/**
 * Start an upgrade. For a brand-new subscriber the response carries `checkoutUrl`
 * (redirect to Stripe Checkout); for an existing subscriber the plan is changed
 * in place and the response carries `changed: true` (no redirect).
 */
export async function startCheckout(planCode: string): Promise<{ checkoutUrl?: string; changed?: boolean }> {
  return apiFetch<{ success: boolean; checkoutUrl?: string; changed?: boolean }>("/api/v1/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan: planCode }),
  });
}

/** Open the Stripe billing portal to manage/cancel; returns the redirect URL. */
export async function openBillingPortal(): Promise<string> {
  const res = await apiFetch<{ success: boolean; portalUrl: string }>("/api/v1/billing/portal", {
    method: "POST",
  });
  return res.portalUrl;
}
