import { ArgumentError } from '@jackwener/opencli/errors';
import { SITE_ORIGIN } from './utils.ts';

export function normalizeKeyword(raw: unknown): string {
  const keyword = String(raw ?? '').trim();
  if (!keyword) throw new ArgumentError('keyword is required');
  return keyword;
}

export function normalizeEngine(raw: unknown): string {
  const engine = String(raw ?? '').trim().toLowerCase();
  return engine || 'google';
}

export function normalizeOptionalNumber(raw: unknown, label: string): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new ArgumentError(`${label} must be a non-negative number`);
  }
  return n;
}

export type KeywordGeneratorUrlOpts = {
  keyword: string;
  engine: string;
  minVolume?: number;
  minCpc?: number;
  maxDifficulty?: number;
};

export function buildKeywordGeneratorUrl(opts: KeywordGeneratorUrlOpts): string {
  const qs = new URLSearchParams({
    searchEngine: opts.engine,
    keyword: opts.keyword,
    webSource: 'Total',
    isWWW: '*',
    tab: 'phraseMatch',
    _: String(Date.now()),
  });
  if (opts.minVolume != null) qs.set('volumeFromValue', String(opts.minVolume));
  if (opts.minCpc != null) qs.set('cpcFromValue', String(opts.minCpc));
  if (opts.maxDifficulty != null) {
    qs.set('difficultyToValue', String(opts.maxDifficulty));
    qs.set('difficultyFromValue', '0');
  }

  return `${SITE_ORIGIN}/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?${qs.toString()}`;
}
