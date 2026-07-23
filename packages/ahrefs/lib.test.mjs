import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeCountry, normalizeKeyword, parseKd, toRows } from './lib.js';

describe('normalizeKeyword', () => {
  it('trims whitespace', () => {
    assert.equal(normalizeKeyword('  keyword research  '), 'keyword research');
  });
  it('rejects empty', () => {
    assert.throws(() => normalizeKeyword(''), /keyword/i);
    assert.throws(() => normalizeKeyword('   '), /keyword/i);
  });
});

describe('normalizeCountry', () => {
  it('defaults to us and lowercases', () => {
    assert.equal(normalizeCountry(undefined), 'us');
    assert.equal(normalizeCountry('US'), 'us');
    assert.equal(normalizeCountry(' uk '), 'gb');
  });
  it('maps uk alias to gb', () => {
    assert.equal(normalizeCountry('uk'), 'gb');
    assert.equal(normalizeCountry('UK'), 'gb');
  });
  it('rejects non two-letter codes', () => {
    assert.throws(() => normalizeCountry('usa'), /country/i);
    assert.throws(() => normalizeCountry('u'), /country/i);
    assert.throws(() => normalizeCountry('12'), /country/i);
  });
});

describe('parseKd', () => {
  it('accepts integers 0-100', () => {
    assert.equal(parseKd(0), 0);
    assert.equal(parseKd(40), 40);
    assert.equal(parseKd(100), 100);
    assert.equal(parseKd('77'), 77);
  });
  it('rejects out of range / non-integer', () => {
    assert.throws(() => parseKd(-1), /kd/i);
    assert.throws(() => parseKd(101), /kd/i);
    assert.throws(() => parseKd(40.5), /kd/i);
    assert.throws(() => parseKd(''), /kd/i);
    assert.throws(() => parseKd('   '), /kd/i);
    assert.throws(() => parseKd(null), /kd/i);
  });
});

describe('toRows', () => {
  it('returns a single-element list', () => {
    assert.deepEqual(toRows('keyword research', 'us', 40), [
      { keyword: 'keyword research', country: 'us', kd: 40 },
    ]);
  });
});
