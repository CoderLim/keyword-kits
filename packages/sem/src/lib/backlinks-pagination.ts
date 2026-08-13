type BacklinkIdentityFields = {
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  sourceTitle: string;
  firstSeen: string;
};

export function backlinkIdentity(row: BacklinkIdentityFields): string {
  if (row.sourceUrl || row.targetUrl) {
    return [row.sourceUrl, row.targetUrl, row.anchor].join('\u001f');
  }
  return [row.sourceTitle, row.anchor, row.firstSeen].join('\u001f');
}

export function parseHasNextState(raw: unknown): boolean {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (
    !parsed
    || typeof parsed !== 'object'
    || typeof (parsed as { hasNext?: unknown }).hasNext !== 'boolean'
  ) {
    throw new TypeError('pagination state must contain a boolean hasNext');
  }
  return (parsed as { hasNext: boolean }).hasNext;
}

export function appendUniqueRows<T>(
  accumulated: T[],
  seen: Set<string>,
  rows: T[],
  keyOf: (row: T) => string,
  limit: number,
): void {
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);
    accumulated.push(row);
    if (accumulated.length >= limit) break;
  }
}

export function rowsFingerprint<T>(rows: T[], keyOf: (row: T) => string): string {
  return rows.map(keyOf).join('\u001f');
}
