/**
 * Normalize --dofollow for sem backlinks.
 * true/follow → ba_rel=follow; false/nofollow → ba_rel=nofollow; all → no ba_rel.
 */
import { ArgumentError } from '@jackwener/opencli/errors';

export type DofollowFilter = true | false | 'all';

const TRUE_VALUES = new Set(['true', 'follow', 'yes', '1', 'dofollow']);
const FALSE_VALUES = new Set(['false', 'nofollow', 'no', '0']);
const ALL_VALUES = new Set(['all', '全部', '*']);

export function normalizeDofollow(
  raw: unknown,
  defaultValue: DofollowFilter = true,
): DofollowFilter {
  if (raw == null || raw === '') return defaultValue;
  if (raw === true) return true;
  if (raw === false) return false;

  const input = String(raw).trim().toLowerCase();
  if (TRUE_VALUES.has(input)) return true;
  if (FALSE_VALUES.has(input)) return false;
  if (ALL_VALUES.has(input)) return 'all';

  throw new ArgumentError(
    `unknown dofollow filter "${raw}". Supported: true (follow), false (nofollow), all`,
  );
}

/** SEMrush ba_rel query value, or undefined to omit (all). */
export function dofollowToBaRel(filter: DofollowFilter): string | undefined {
  if (filter === true) return 'follow';
  if (filter === false) return 'nofollow';
  return undefined;
}
