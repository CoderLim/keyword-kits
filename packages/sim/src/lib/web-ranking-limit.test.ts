import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_WEB_RANKING_LIMIT,
  normalizeWebRankingLimit,
  rankingIdentity,
} from './web-ranking-limit.ts';

describe('normalizeWebRankingLimit', () => {
  it('accepts positive integers up to 1000', () => {
    assert.equal(normalizeWebRankingLimit(1), 1);
    assert.equal(normalizeWebRankingLimit(1000), 1000);
    assert.equal(MAX_WEB_RANKING_LIMIT, 1000);
  });

  it('rejects integers greater than 1000', () => {
    assert.throws(
      () => normalizeWebRankingLimit(1001),
      /limit must be <= 1000/,
    );
  });

  it('rejects values that are not positive integers', () => {
    for (const value of [0, -1, 1.5, 'abc']) {
      assert.throws(
        () => normalizeWebRankingLimit(value),
        /limit must be a positive integer/,
      );
    }
  });
});

describe('rankingIdentity', () => {
  it('keys rows by lowercase domain', () => {
    assert.equal(rankingIdentity({ domain: 'YouTube.com' }), 'youtube.com');
  });
});
