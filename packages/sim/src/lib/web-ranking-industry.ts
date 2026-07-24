import { ArgumentError } from '@jackwener/opencli/errors';

/** CLI display/alias (lowercase key) → URL path id */
const INDUSTRY_ALIASES: Record<string, string> = {
  all: 'All',
  'ai chatbots and tools': 'AI_Chatbots_and_Tools',
  ai_chatbots_and_tools: 'AI_Chatbots_and_Tools',
  games: 'Games',
  游戏: 'Games',
  soccer: 'Sports~Soccer',
  足球: 'Sports~Soccer',
  'sports~soccer': 'Sports~Soccer',
};

export function listIndustries(): string[] {
  const ids = new Set<string>(Object.values(INDUSTRY_ALIASES));
  return ['All', ...[...ids].filter((id) => id !== 'All').sort()];
}

export function resolveIndustryId(raw: unknown): string {
  const input = String(raw ?? '').trim();
  if (!input) return 'All';

  const key = input.toLowerCase();
  const mapped = INDUSTRY_ALIASES[key];
  if (mapped) return mapped;

  const knownIds = new Set(Object.values(INDUSTRY_ALIASES));
  if (knownIds.has(input)) return input;

  const known = [...new Set(['All', ...Object.keys(INDUSTRY_ALIASES)])]
    .filter((k) => k !== 'all')
    .sort()
    .join(', ');
  throw new ArgumentError(
    `unknown industry "${input}". Supported: ${known}`,
  );
}
