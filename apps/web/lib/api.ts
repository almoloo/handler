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

/**
 * `GET /agents/:id`'s `policy` field for a hired agent. Mirrors
 * `AgentFilePolicy` in apps/api's policies.service.ts — the same `Omit` over
 * `PayrollAgent` the backend derives it from, so the two stay in lockstep by
 * construction rather than by hand-copied field lists.
 */
export type AgentFilePolicy = Omit<
  PayrollAgent,
  "name" | "avatar" | "agentId" | "trustTier" | "trustSummary" | "pendingApprovalCount"
>;

/**
 * `GET /agents/:id`'s response — the agent file screen's data. Mirrors
 * `AgentFile` in apps/api's policies.service.ts field-for-field, with one
 * intentional tightening: `recentActivity[].type` is typed as the real
 * `ActivityType` union rather than the backend's bare `string`, matching the
 * precedent already set for `trustTier`/`trustSummary` on `PayrollAgent`
 * (5a's audit note) — the value is read straight off an `ActivityEvent` row,
 * so the stricter type costs nothing and lets `activityStatus()` consume it
 * directly. `policy: null` means this wallet hasn't hired the agent yet —
 * a normal browsing state, not an error.
 */
export interface AgentFile {
  agentId: string;
  address: string;
  name: string;
  description: string | null;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
  policy: AgentFilePolicy | null;
  recentActivity: Array<{
    id: string;
    type: ActivityType;
    summary: string;
    amountUsd: string | null;
    txHash: string | null;
    createdAt: string;
  }>;
}

/** Mirrors the backend's `ActivityType` enum (`generated/prisma/enums.ts`). */
export type ActivityType =
  | "WALLET_CREATED"
  | "HIRED"
  | "POLICY_UPDATED"
  | "FROZEN"
  | "UNFROZEN"
  | "SWAP"
  | "AGENT_PAYMENT"
  | "TRANSFER"
  | "CONTRACT_CALL"
  | "BLOCKED"
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "EXPIRED"
  | "FAILED";

/** Mirrors the backend's `ActivitySource` enum. */
export type ActivitySource = "CHAIN" | "RUNTIME";

/** Mirrors the backend's `BlockReason` enum. */
export type BlockReason =
  | "AGENT_FROZEN"
  | "UNKNOWN_CONTRACT"
  | "SWAPS_NOT_ALLOWED"
  | "COUNTERPARTY_BELOW_TIER"
  | "EXCEEDS_PER_TX_CAP"
  | "EXCEEDS_DAILY_ALLOWANCE"
  | "REQUIRES_COSIGN"
  | "STALE_PRICE"
  | "OTHER";

export type ActivityFilter = "all" | "blocked" | "pending";

export interface ActivityAgentRef {
  id: string;
  name: string;
  avatar: string | null;
}

/**
 * One row of `GET /activity` / `GET /events/stream`. Mirrors `ActivityItem`
 * in apps/api's activity.service.ts field-for-field — this shape is
 * load-bearing for the approval sheet feature (6b), which reads
 * `pendingApprovalId` off it, so keep it an exact mirror rather than
 * narrowing it for this feature's own convenience.
 * `seq` and every `*Usd`/raw-amount field are decimal strings — parse with
 * BigInt, never parseFloat.
 */
export interface ActivityItem {
  id: string;
  seq: string;
  type: ActivityType;
  source: ActivitySource;
  blockReason: BlockReason | null;
  amountUsd: string | null;
  tokenAddress: string | null;
  tokenAmountRaw: string | null;
  target: string | null;
  agent: ActivityAgentRef | null;
  counterparty: ActivityAgentRef | null;
  txHash: string | null;
  summary: string;
  detail: Record<string, unknown>;
  pendingApprovalId: string | null;
  createdAt: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

/** Mirrors the backend's `ApprovalStatus` enum. */
export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";

export interface ApprovalAgentRef {
  id: string;
  name: string;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
}

/**
 * `GET /approvals/:id`'s response — the approval sheet's data. Mirrors
 * `ApprovalDetail` in apps/api's approvals.service.ts field-for-field.
 * `amountUsd` is an 8-decimal fixed-point integer as a decimal string —
 * parse with BigInt, never parseFloat.
 */
export interface ApprovalDetail {
  id: string;
  status: ApprovalStatus;
  amountUsd: string;
  target: string;
  summary: string;
  decoded: Record<string, unknown>;
  proposedAt: string;
  expiresAt: string | null;
  agent: ApprovalAgentRef;
  counterparty: ApprovalAgentRef | null;
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
 *
 * Exported for `lib/demo.ts`, which needs the same base URL, cookie and error
 * handling but adds the director's own header. That direction is fine; the
 * reverse is not — no product screen may import from `lib/demo.ts`.
 */
export async function apiFetch<T>(
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

/**
 * One agent's file: profile + trust badge, this wallet's policy for it (or
 * `null` if not hired), and its recent activity. A 404 (unknown agent id)
 * surfaces as a real `ApiError(404, ...)` via `apiFetch`'s generic error
 * path, same as `fetchApproval`. A 401 can only mean the session expired
 * mid-use.
 */
export async function fetchAgentFile(agentId: string): Promise<AgentFile> {
  const result = await apiFetch<AgentFile>(`/agents/${agentId}`);
  if (!result) {
    throw new ApiError(401, "Session expired");
  }
  return result;
}

/**
 * One page of the signed-in wallet's activity feed. `{ items: [], nextCursor:
 * null }` means this owner has no activity yet (e.g. no `hireAgent` tx) — a
 * real empty state, not an error. A 401 can only mean the session expired
 * mid-use (the `/app` layout gates on it), so it throws rather than
 * masquerading as an empty feed.
 */
export async function fetchActivity(options?: {
  filter?: ActivityFilter;
  before?: string;
  limit?: number;
}): Promise<ActivityPage> {
  const params = new URLSearchParams();
  if (options?.filter) params.set("filter", options.filter);
  if (options?.before) params.set("before", options.before);
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const result = await apiFetch<ActivityPage>(
    `/activity${query ? `?${query}` : ""}`,
  );
  if (!result) {
    throw new ApiError(401, "Session expired");
  }
  return result;
}

/**
 * The approval sheet's data. A 404 (unknown id, or one belonging to a
 * different wallet — indistinguishable by design) surfaces as a real
 * `ApiError(404, ...)` via `apiFetch`'s generic error path, for the sheet
 * to render as "this request no longer exists." A 401 can only mean the
 * session expired mid-use.
 */
export async function fetchApproval(id: string): Promise<ApprovalDetail> {
  const result = await apiFetch<ApprovalDetail>(`/approvals/${id}`);
  if (!result) {
    throw new ApiError(401, "Session expired");
  }
  return result;
}
