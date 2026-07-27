import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeBacklinksLimit } from './backlinks-limit.ts';

describe('normalizeBacklinksLimit', () => {
  it('accepts positive integers up to 100', () => {
    assert.equal(normalizeBacklinksLimit(1), 1);
    assert.equal(normalizeBacklinksLimit(100), 100);
  });

  it('rejects integers greater than 100', () => {
    assert.throws(
      () => normalizeBacklinksLimit(101),
      /limit must be <= 100/,
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
