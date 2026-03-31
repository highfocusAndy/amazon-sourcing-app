/** Normalize password input consistently between signup and login. */
export function normalizePasswordInput(value: unknown): string {
  const raw = typeof value === "string" ? value : String(value ?? "");
  return raw.normalize("NFKC").trim();
}

/**
 * Candidate passwords to compare for backward compatibility with old rows.
 * Tries normalized first, then raw variants for legacy signups.
 */
export function passwordCompareCandidates(value: unknown): string[] {
  const raw = typeof value === "string" ? value : String(value ?? "");
  const normalized = normalizePasswordInput(raw);
  const out = [normalized];
  if (!out.includes(raw)) out.push(raw);
  const rawTrim = raw.trim();
  if (!out.includes(rawTrim)) out.push(rawTrim);
  const nfkcRaw = raw.normalize("NFKC");
  if (!out.includes(nfkcRaw)) out.push(nfkcRaw);
  const nfkcTrim = nfkcRaw.trim();
  if (!out.includes(nfkcTrim)) out.push(nfkcTrim);
  return out.filter(Boolean);
}
