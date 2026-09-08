const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export interface NonceResponse {
  nonce: string;
}

export interface SessionResponse {
  address: string;
}

export interface LogoutResponse {
  ok: true;
}

/** Trust tiers as the API returns them (mirrors the backend's `TrustTier`). */
export type TrustTier = "VERIFIED" | "NEW" | "FLAGGED";

/**
 * One row of `GET /agents` — an agent this wallet has hired, with its policy.
 * Mirrors `PayrollAgent` in apps/api's policies.service.ts; there is no shared
 * type package between the two apps yet, so this is hand-kept in sync.
 * All `*Usd` fields are 8-decimal fixed-point integers as decimal strings —
 * parse with BigInt, never parseFloat.
 */
export interface PayrollAgent {
  policyId: string;
  sessionKey: string;
  agentId: string;
  name: string;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
  dailyCapUsd: string;
  perTxCapUsd: string;
  cosignAboveUsd: string;
  spentTodayUsd: string;
  frozen: boolean;
  allowSwaps: boolean;
  allowUnknownContracts: boolean;
  policySentences: string[];
  hiredAt: string;
  pendingApprovalCount: number;
}

/**
 * One row of `GET /agents/catalog` — a hireable agent, not yet scoped to any
 * wallet. Mirrors `CatalogAgent` in apps/api's policies.service.ts.
 */
export interface CatalogAgent {
  agentId: string;
  address: string;
  name: string;
  description: string | null;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True for the one error every `/app` screen handles the same way: the
 * session expired mid-use, so the app must re-gate to sign-in. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * The only place any /app screen may reach the backend from — always sends
 * the session cookie and always resolves against NEXT_PUBLIC_API_URL.
 * A 401 is returned as null rather than thrown, since "no session yet" is an
 * expected state for the sign-in gate, not an error.
 */
async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : res.statusText;
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export async function fetchNonce(address: string): Promise<NonceResponse> {
  const result = await apiFetch<NonceResponse>("/auth/nonce", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
  if (!result) {
    throw new ApiError(401, "Unexpected 401 fetching a nonce");
  }
  return result;
}

export async function verifySiwe(
  message: string,
  signature: string,
): Promise<SessionResponse> {
  const result = await apiFetch<SessionResponse>("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ message, signature }),
  });
  if (!result) {
    throw new ApiError(401, "SIWE verification failed");
  }
  return result;
}

export async function fetchSession(): Promise<SessionResponse | null> {
  return apiFetch<SessionResponse>("/auth/session");
}

export async function logout(): Promise<LogoutResponse | null> {
  return apiFetch<LogoutResponse>("/auth/logout", { method: "POST" });
}

/**
 * The signed-in wallet's payroll. `[]` means this owner has hired no one yet —
 * a real empty state, not an error. A 401 can only mean the session expired
 * mid-session (the `/app` layout gates on it), so it throws rather than
 * masquerading as an empty payroll.
 */
export async function fetchAgents(): Promise<PayrollAgent[]> {
  const result = await apiFetch<PayrollAgent[]>("/agents");
  if (!result) {
    throw new ApiError(401, "Session expired");
  }
  return result;
}

/**
 * The hireable agent catalog for step 1 of the hire flow. Not wallet-scoped —
 * a 401 here still only means the session expired mid-use.
 */
export async function fetchCatalog(): Promise<CatalogAgent[]> {
  const result = await apiFetch<CatalogAgent[]>("/agents/catalog");
  if (!result) {
    throw new ApiError(401, "Session expired");
  }
  return result;
}
