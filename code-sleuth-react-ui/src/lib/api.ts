/**
 * Same-origin API client for the CodeClone SPA.
 *
 * The backend has no CORS and protects mutating requests with a session CSRF
 * token delivered in the `/api/session` (and login) responses. This module is
 * the single place that:
 *   - injects the `X-CSRF-Token` header on mutating requests,
 *   - forwards the UI language via `X-App-Language`,
 *   - leaves FormData/Blob bodies untouched so the browser sets the multipart
 *     boundary (file uploads),
 *   - parses the JSON envelope and throws a typed {@link ApiError} on failure,
 *   - notifies a registered handler on 401 so the app can drop to logged-out.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    // Restore prototype chain for `instanceof` under transpilation targets.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

let csrfToken = "";
let apiLanguage = "en";
let unauthorizedHandler: (() => void) | null = null;

/** Store the current session CSRF token (from /api/session or login). */
export function setCsrfToken(token: string): void {
  csrfToken = token || "";
}

/** Set the language sent as `X-App-Language` on every request. */
export function setApiLanguage(language: string): void {
  apiLanguage = language || "en";
}

/** Register (or clear) the callback invoked when any request returns 401. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function extractMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error === "string" && record.error) return record.error;
  }
  if (typeof payload === "string" && payload.trim()) return payload;
  return `Request failed (${status})`;
}

export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (apiLanguage) headers.set("X-App-Language", apiLanguage);
  if (!SAFE_METHODS.has(method) && csrfToken) headers.set("X-CSRF-Token", csrfToken);

  // JSON string bodies get the Content-Type; FormData/Blob must keep the
  // browser-generated multipart boundary, so never override it for those.
  const body = options.body;
  if (typeof body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
  });

  if (response.status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }

  let payload: unknown = null;
  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => "");
      payload = text || null;
    }
  }

  if (!response.ok) {
    throw new ApiError(extractMessage(payload, response.status), response.status, payload);
  }

  return payload as T;
}
