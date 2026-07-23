import { parseCpc, parseDifficulty, parseVolume } from './metrics.ts';

export type KeywordRow = {
  keyword: string;
  volume: string;
  cpc: string;
  difficulty: string;
  [key: string]: string | number | undefined;
};

export type KeywordFilterOpts = {
  minVolume?: number;
  minCpc?: number;
  maxDifficulty?: number;
};

export function applyLocalFilters(rows: KeywordRow[], opts: KeywordFilterOpts): KeywordRow[] {
  return rows.filter((row) => {
    if (opts.minVolume != null) {
      const v = parseVolume(row.volume);
      if (v == null || v < opts.minVolume) return false;
    }
    if (opts.minCpc != null) {
      const c = parseCpc(row.cpc);
      if (c == null || c < opts.minCpc) return false;
    }
    if (opts.maxDifficulty != null) {
      const d = parseDifficulty(String(row.difficulty));
      if (d == null || d > opts.maxDifficulty) return false;
    }
    return true;
  });
}
