import { ApiError, type ApiErrorBody } from "../types/auth";
import { getStoredToken } from "./tokenStorage";

// Requests go to /api/... and are proxied to the backend by Vite in dev
// (see vite.config.ts) so no CORS setup is required on the server.
const API_BASE = "/api";

export async function authRequest<TResponse>(
  path: string,
  options: RequestInit = {}
): Promise<TResponse> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

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

// Same auth/error handling as authRequest, but for multipart/form-data
// uploads — the Content-Type (with boundary) must be left for the browser
// to set, so it can't reuse authRequest's JSON header.
export async function authUpload<TResponse>(
  path: string,
  formData: FormData
): Promise<TResponse> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: formData,
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
