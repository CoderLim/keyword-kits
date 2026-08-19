import { ArgumentError } from '@jackwener/opencli/errors';

export const SEARCH_CONSOLE_URL = 'https://search.google.com/search-console';

export function normalizeTargetUrl(raw: unknown): string {
  const input = String(raw ?? '').trim();
  if (!input) throw new ArgumentError('url is required');
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new ArgumentError(`invalid url "${input}"`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ArgumentError(`unsupported url protocol "${parsed.protocol}"`);
  }
  if (!parsed.hostname) {
    throw new ArgumentError(`invalid url "${input}"`);
  }
  return parsed.toString();
}

export function normalizeProperty(raw: unknown, targetUrl: string): string {
  const input = String(raw ?? '').trim();
  if (!input) {
    const parsed = new URL(targetUrl);
    return `${parsed.origin}/`;
  }
  if (input.startsWith('sc-domain:')) return input;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new ArgumentError(
      `invalid property "${input}". Use sc-domain:example.com or a full URL-prefix property`,
    );
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ArgumentError(`unsupported property protocol "${parsed.protocol}"`);
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname = `${parsed.pathname}/`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

export function buildPropertyUrl(property: string): string {
  return `${SEARCH_CONSOLE_URL}?resource_id=${encodeURIComponent(property)}`;
}
