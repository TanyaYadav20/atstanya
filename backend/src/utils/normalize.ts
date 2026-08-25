// ============================================================
// Shared identity-signal normalization helpers.
// ============================================================

export function normalizeText(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizePhone(value?: string | null): string {
  if (!value) {
    return "";
  }

  // Keep only digits
  return value.replace(/\D/g, "");
}

export function normalizeUrl(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}
