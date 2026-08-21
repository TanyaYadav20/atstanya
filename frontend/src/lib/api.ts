import {
  ApiError,
  type ApiErrorBody,
  type LoginPayload,
  type LoginResponse,
  type RegisterPayload,
  type RegisterResponse,
} from "../types/auth";

// Requests go to /api/... and are proxied to the backend by Vite in dev
// (see vite.config.ts) so no CORS setup is required on the server.
const API_BASE = "/api";

async function postJson<TResponse>(
  path: string,
  body: unknown
): Promise<TResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<
    TResponse & ApiErrorBody
  >;

  if (!res.ok) {
    const message =
      (data as ApiErrorBody).message ?? "Something went wrong. Please try again.";
    throw new ApiError(message, res.status);
  }

  return data as TResponse;
}

export function login(payload: LoginPayload): Promise<LoginResponse> {
  return postJson<LoginResponse>("/auth/login", payload);
}

export function register(payload: RegisterPayload): Promise<RegisterResponse> {
  return postJson<RegisterResponse>("/auth/register", payload);
}
