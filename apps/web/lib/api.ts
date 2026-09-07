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

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
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
