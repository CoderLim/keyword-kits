import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_BACKLINKS_LIMIT,
  normalizeBacklinksLimit,
} from './backlinks-limit.ts';

describe('normalizeBacklinksLimit', () => {
  it('accepts positive integers up to 1000', () => {
    assert.equal(normalizeBacklinksLimit(1), 1);
    assert.equal(normalizeBacklinksLimit(1000), 1000);
    assert.equal(MAX_BACKLINKS_LIMIT, 1000);
  });

  it('rejects integers greater than 1000', () => {
    assert.throws(
      () => normalizeBacklinksLimit(1001),
      /limit must be <= 1000/,
    );
  });

  it('rejects values that are not positive integers', () => {
    for (const value of [0, -1, 1.5, 'abc']) {
      assert.throws(
        () => normalizeBacklinksLimit(value),
        /limit must be a positive integer/,
      );
    }
  });
});
