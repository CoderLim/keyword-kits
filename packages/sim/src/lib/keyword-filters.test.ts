import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyLocalFilters, type KeywordRow } from './keyword-filters.ts';

const rows: KeywordRow[] = [
  { keyword: 'a', volume: '2K', cpc: '$1.00', difficulty: '30' },
  { keyword: 'b', volume: '500', cpc: '$0.10', difficulty: '80' },
  { keyword: 'c', volume: '-', cpc: '$2.00', difficulty: '10' },
];

describe('applyLocalFilters', () => {
  it('returns all rows when no filters', () => {
    assert.equal(applyLocalFilters(rows, {}).length, 3);
  });
  it('filters by minVolume', () => {
    const out = applyLocalFilters(rows, { minVolume: 1000 });
    assert.deepEqual(out.map((r) => r.keyword), ['a']);
  });
  it('filters by minCpc', () => {
    const out = applyLocalFilters(rows, { minCpc: 0.5 });
    assert.deepEqual(out.map((r) => r.keyword), ['a', 'c']);
  });
  it('filters by maxDifficulty', () => {
    const out = applyLocalFilters(rows, { maxDifficulty: 50 });
    assert.deepEqual(out.map((r) => r.keyword), ['a', 'c']);
  });
  it('drops rows that cannot be parsed when that filter is set', () => {
    const out = applyLocalFilters(rows, { minVolume: 1 });
    assert.ok(!out.some((r) => r.keyword === 'c'));
  });
  it('combines filters', () => {
    const out = applyLocalFilters(rows, { minVolume: 100, minCpc: 0.5, maxDifficulty: 50 });
    assert.deepEqual(out.map((r) => r.keyword), ['a']);
  });
});
