// ============================================================
// Shared identity-signal normalization helpers.
//
// Used by both the Candidate schema (so stored values are
// already normalized) and candidateMatching.service.ts (so
// comparisons are consistent with what's stored). Kept in one
// place to avoid two copies of the same normalization rules
// drifting apart.
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
