import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildKeywordGeneratorUrl,
  normalizeEngine,
  normalizeKeyword,
  normalizeOptionalNumber,
} from './keyword-generator-url.ts';

describe('normalizeKeyword', () => {
  it('trims and requires non-empty', () => {
    assert.equal(normalizeKeyword('  dice '), 'dice');
    assert.throws(() => normalizeKeyword(''), /keyword/i);
    assert.throws(() => normalizeKeyword('   '), /keyword/i);
  });
});

describe('normalizeEngine', () => {
  it('defaults to google', () => {
    assert.equal(normalizeEngine(undefined), 'google');
    assert.equal(normalizeEngine(''), 'google');
  });
  it('lowercases engine', () => {
    assert.equal(normalizeEngine('Google'), 'google');
  });
});

describe('normalizeOptionalNumber', () => {
  it('returns undefined for empty', () => {
    assert.equal(normalizeOptionalNumber(undefined, 'min-volume'), undefined);
    assert.equal(normalizeOptionalNumber('', 'min-volume'), undefined);
    assert.equal(normalizeOptionalNumber(null, 'min-volume'), undefined);
  });
  it('rejects negative', () => {
    assert.throws(() => normalizeOptionalNumber(-1, 'min-volume'), /min-volume/i);
  });
  it('rejects non-finite', () => {
    assert.throws(() => normalizeOptionalNumber('abc', 'min-volume'), /min-volume/i);
    assert.throws(() => normalizeOptionalNumber(NaN, 'min-volume'), /min-volume/i);
  });
  it('accepts non-negative numbers', () => {
    assert.equal(normalizeOptionalNumber(0, 'min-volume'), 0);
    assert.equal(normalizeOptionalNumber('1000', 'min-volume'), 1000);
  });
});

describe('buildKeywordGeneratorUrl', () => {
  it('builds base phraseMatch URL', () => {
    const url = buildKeywordGeneratorUrl({ keyword: 'dice', engine: 'google' });
    assert.match(url, /keyword-generator-tool\/999\/28d/);
    assert.match(url, /searchEngine=google/);
    assert.match(url, /keyword=dice/);
    assert.match(url, /tab=phraseMatch/);
    assert.match(url, /webSource=Total/);
    assert.match(url, /isWWW=\*/);
    assert.match(url, /_=\d+/);
  });
  it('adds volumeFromValue when minVolume set', () => {
    const url = buildKeywordGeneratorUrl({ keyword: 'dice', engine: 'google', minVolume: 1000 });
    assert.match(url, /volumeFromValue=1000/);
  });
  it('adds cpcFromValue when minCpc set', () => {
    const url = buildKeywordGeneratorUrl({ keyword: 'dice', engine: 'google', minCpc: 1 });
    assert.match(url, /cpcFromValue=1/);
  });
  it('adds difficultyToValue and difficultyFromValue=0 when maxDifficulty set', () => {
    const url = buildKeywordGeneratorUrl({ keyword: 'dice', engine: 'google', maxDifficulty: 50 });
    assert.match(url, /difficultyToValue=50/);
    assert.match(url, /difficultyFromValue=0/);
  });
});
