import { apiFetch } from "@/lib/api";
import { downloadText } from "@/lib/download";

/**
 * GDPR data export: fetch the caller's full data bundle and save it locally as
 * JSON. The endpoint returns `{ success, data }`; we download the `data` body.
 */
export async function exportAccountData(): Promise<void> {
  const result = await apiFetch<{ success: boolean; data: unknown }>("/api/v1/account/export");
  const body = result && typeof result === "object" && "data" in result ? result.data : result;
  downloadText("codesimilar-data-export.json", JSON.stringify(body, null, 2), "application/json");
}

/** Permanently delete the caller's account (password-confirmed). */
export async function deleteAccount(password: string): Promise<void> {
  await apiFetch("/api/v1/account/delete", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}
