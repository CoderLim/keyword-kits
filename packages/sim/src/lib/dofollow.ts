/**
 * Normalize --dofollow for sim backlinks.
 * true → follow=DoFollowOnly; false → follow=NoFollowOnly; all → omit (page default).
 */
import { ArgumentError } from '@jackwener/opencli/errors';

export type DofollowFilter = true | false | 'all';

const TRUE_VALUES = new Set(['true', 'follow', 'yes', '1', 'dofollow']);
const FALSE_VALUES = new Set(['false', 'nofollow', 'no', '0']);
const ALL_VALUES = new Set(['all', '全部', '*']);

export function normalizeDofollow(
  raw: unknown,
  defaultValue: DofollowFilter = 'all',
): DofollowFilter {
  if (raw == null || raw === '') return defaultValue;
  if (raw === true) return true;
  if (raw === false) return false;

  const input = String(raw).trim().toLowerCase();
  if (TRUE_VALUES.has(input)) return true;
  if (FALSE_VALUES.has(input)) return false;
  if (ALL_VALUES.has(input)) return 'all';

  throw new ArgumentError(
    `unknown dofollow filter "${raw}". Supported: true (DoFollow), false (NoFollow), all`,
  );
}

/** SimilarWeb hash `follow=` value, or undefined to omit (all). */
export function dofollowToFollowParam(filter: DofollowFilter): string | undefined {
  if (filter === true) return 'DoFollowOnly';
  if (filter === false) return 'NoFollowOnly';
  return undefined;
}
