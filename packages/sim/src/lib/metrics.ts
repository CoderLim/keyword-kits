/** Parse SimilarWeb-style volume strings ("1.2K", "3M", "1200") → number, or null. */
export function parseVolume(raw: string): number | null {
  const s = String(raw ?? '').trim().replace(/,/g, '');
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;
  const m = s.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] || '').toLowerCase();
  const mult = suf === 'k' ? 1_000 : suf === 'm' ? 1_000_000 : suf === 'b' ? 1_000_000_000 : 1;
  return n * mult;
}

/** Parse CPC ("$0.45", "0.45") → number, or null. */
export function parseCpc(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Parse difficulty ("42", "42%") → number, or null. */
export function parseDifficulty(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}
