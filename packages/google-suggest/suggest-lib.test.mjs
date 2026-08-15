import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cursorPositions } from './suggest-lib.js';

describe('cursorPositions', () => {
  it('returns start, after each word, and end for multi-word query', () => {
    const positions = cursorPositions('anime expedition codes');
    assert.deepEqual(positions, [
      { cp: 0, cursor: 'start' },
      { cp: 5, cursor: 'after:anime' },
      { cp: 16, cursor: 'after:expedition' },
      { cp: 22, cursor: 'end' },
    ]);
  });

  it('dedupes when single word end equals string end', () => {
    const positions = cursorPositions('gpts');
    assert.deepEqual(positions, [
      { cp: 0, cursor: 'start' },
      { cp: 4, cursor: 'end' },
    ]);
  });

  it('handles empty string as start/end only', () => {
    assert.deepEqual(cursorPositions(''), [{ cp: 0, cursor: 'end' }]);
  });
});
