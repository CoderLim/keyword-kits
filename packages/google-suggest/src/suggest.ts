/**
 * google suggest — Google Search Suggestions via public Suggest API.
 *
 * Overrides the built-in opencli `google suggest` command.
 *
 * Strategy: PUBLIC
 * Evidence: https://suggestqueries.google.com/complete/search?client=firefox
 *
 * Default: suggestions as if the cursor is at the end of the query (no `cp`).
 * `--move-cursor`: sweep cursor at start, after each word, and at end.
 */

import { CliError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { cursorPositions } from './suggest-lib.js';

const SUGGEST_ENDPOINT =
  'https://suggestqueries.google.com/complete/search?client=firefox';

async function fetchSuggestions(
  keyword: string,
  lang: string,
  cp: number | undefined,
): Promise<string[]> {
  const params = new URLSearchParams({
    q: keyword,
    hl: lang,
  });
  if (cp !== undefined) {
    params.set('cp', String(cp));
  }
  const url = `${SUGGEST_ENDPOINT}&${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new CliError(
      'FETCH_ERROR',
      `HTTP ${resp.status}`,
      'Check your network connection',
    );
  }
  const data: unknown = await resp.json();
  return Array.isArray(data) && Array.isArray(data[1])
    ? (data[1] as string[])
    : [];
}

cli({
  site: 'google',
  name: 'suggest',
  access: 'read',
  description:
    'Get Google search suggestions (keyword-kits: supports --move-cursor)',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'keyword', positional: true, required: true, help: 'Search query' },
    { name: 'lang', default: 'zh-CN', help: 'Language code' },
    {
      name: 'move-cursor',
      type: 'bool',
      default: false,
      help: 'Sweep cursor at start, after each word, and end (adds cp/cursor columns)',
    },
  ],
  columns: ['suggestion', 'cp', 'cursor'],
  func: async (args) => {
    const keyword = String(args.keyword ?? '');
    const lang = String(args.lang ?? 'zh-CN');
    const moveCursor = Boolean(args['move-cursor']);

    if (!moveCursor) {
      const suggestions = await fetchSuggestions(keyword, lang, undefined);
      if (!suggestions.length) {
        throw new CliError(
          'NOT_FOUND',
          'No suggestions found',
          'Try a different keyword',
        );
      }
      return suggestions.map((s) => ({
        suggestion: s,
        cp: '',
        cursor: 'end',
      }));
    }

    const rows: Array<{ suggestion: string; cp: number; cursor: string }> = [];
    for (const { cp, cursor } of cursorPositions(keyword)) {
      const suggestions = await fetchSuggestions(keyword, lang, cp);
      for (const suggestion of suggestions) {
        rows.push({ suggestion, cp, cursor });
      }
    }

    if (!rows.length) {
      throw new CliError(
        'NOT_FOUND',
        'No suggestions found',
        'Try a different keyword',
      );
    }
    return rows;
  },
});
