import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeBacklinksLimit } from './backlinks-limit.ts';

describe('normalizeBacklinksLimit', () => {
  it('accepts positive integers greater than 100', () => {
    assert.equal(normalizeBacklinksLimit(101), 101);
    assert.equal(normalizeBacklinksLimit(1_000), 1_000);
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
