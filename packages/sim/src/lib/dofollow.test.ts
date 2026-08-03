import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dofollowToFollowParam, normalizeDofollow } from './dofollow.ts';

describe('normalizeDofollow', () => {
  it('defaults to all', () => {
    assert.equal(normalizeDofollow(undefined), 'all');
    assert.equal(normalizeDofollow(''), 'all');
  });

  it('accepts true / false / all', () => {
    assert.equal(normalizeDofollow(true), true);
    assert.equal(normalizeDofollow('nofollow'), false);
    assert.equal(normalizeDofollow('all'), 'all');
  });

  it('rejects unknown', () => {
    assert.throws(() => normalizeDofollow('maybe'), /unknown dofollow/);
  });
});

describe('dofollowToFollowParam', () => {
  it('maps filters to SimilarWeb follow= values', () => {
    assert.equal(dofollowToFollowParam(true), 'DoFollowOnly');
    assert.equal(dofollowToFollowParam(false), 'NoFollowOnly');
    assert.equal(dofollowToFollowParam('all'), undefined);
  });
});
