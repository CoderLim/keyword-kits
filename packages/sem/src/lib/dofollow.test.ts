import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dofollowToBaRel, normalizeDofollow } from './dofollow.ts';

describe('normalizeDofollow', () => {
  it('defaults to true (follow)', () => {
    assert.equal(normalizeDofollow(undefined), true);
    assert.equal(normalizeDofollow(''), true);
  });

  it('accepts true aliases', () => {
    assert.equal(normalizeDofollow(true), true);
    assert.equal(normalizeDofollow('follow'), true);
    assert.equal(normalizeDofollow('DoFollow'), true);
  });

  it('accepts false aliases', () => {
    assert.equal(normalizeDofollow(false), false);
    assert.equal(normalizeDofollow('nofollow'), false);
  });

  it('accepts all', () => {
    assert.equal(normalizeDofollow('all'), 'all');
  });

  it('rejects unknown', () => {
    assert.throws(() => normalizeDofollow('maybe'), /unknown dofollow/);
  });
});

describe('dofollowToBaRel', () => {
  it('maps filters to ba_rel', () => {
    assert.equal(dofollowToBaRel(true), 'follow');
    assert.equal(dofollowToBaRel(false), 'nofollow');
    assert.equal(dofollowToBaRel('all'), undefined);
  });
});
