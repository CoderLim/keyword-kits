/**
 * Cursor sweep helpers for Google Suggest `cp` parameter.
 */

export type CursorPosition = {
  cp: number;
  cursor: string;
};

/**
 * Cursor positions for --move-cursor: start, after each word, end (deduped, ascending).
 * `cp` is a 0-based JS string index (UTF-16 code unit), matching the web search box.
 */
export function cursorPositions(keyword: string): CursorPosition[] {
  const positions = new Map<number, string>();

  positions.set(0, 'start');

  for (const match of keyword.matchAll(/\S+/g)) {
    const cp = (match.index ?? 0) + match[0].length;
    const label = `after:${match[0]}`;
    if (!positions.has(cp)) {
      positions.set(cp, label);
    }
  }

  const end = keyword.length;
  // If last word end coincides with string end, keep a single row labeled end.
  positions.set(end, 'end');

  return [...positions.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cp, cursor]) => ({ cp, cursor }));
}
