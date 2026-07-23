import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasSummaryMetrics,
  normalizeCountry,
  normalizeDomain,
  normalizeKeyword,
  parseCount,
  parseKd,
  parsePercent,
  toRows,
} from './lib.js';

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

describe('normalizeDomain', () => {
  it('strips protocol and path', () => {
    assert.equal(normalizeDomain('https://www.AhRefs.com/path?x=1'), 'www.ahrefs.com');
    assert.equal(normalizeDomain('ahrefs.com'), 'ahrefs.com');
  });
  it('rejects empty or invalid', () => {
    assert.throws(() => normalizeDomain(''), /domain/i);
    assert.throws(() => normalizeDomain('not a domain'), /domain/i);
    assert.throws(() => normalizeDomain('localhost'), /domain/i);
  });
});

describe('parseCount', () => {
  it('parses plain and abbreviated numbers', () => {
    assert.equal(parseCount('12345'), 12345);
    assert.equal(parseCount('12,345'), 12345);
    assert.equal(parseCount(100), 100);
    assert.equal(parseCount('12.5K'), 12500);
    assert.equal(parseCount('109K'), 109000);
    assert.equal(parseCount('1.2M'), 1200000);
    assert.equal(parseCount('22M'), 22000000);
  });
  it('rejects empty', () => {
    assert.throws(() => parseCount(''), /count|number/i);
    assert.throws(() => parseCount(null), /count|number/i);
  });
});

describe('parsePercent', () => {
  it('parses percent strings to number 0-100', () => {
    assert.equal(parsePercent('67.8%'), 67.8);
    assert.equal(parsePercent('72%'), 72);
    assert.equal(parsePercent(50), 50);
    assert.equal(parsePercent('67% dofollow'), 67);
    assert.equal(parsePercent('75% dofollow'), 75);
  });
  it('rejects out of range', () => {
    assert.throws(() => parsePercent('101%'), /percent/i);
    assert.throws(() => parsePercent(''), /percent/i);
  });
});

describe('hasSummaryMetrics', () => {
  it('true when any of dr/refDomains/backlinks is a finite number', () => {
    assert.equal(hasSummaryMetrics({ domain: 'x.com', dr: 10 }), true);
    assert.equal(hasSummaryMetrics({ domain: 'x.com', refDomains: 1 }), true);
    assert.equal(hasSummaryMetrics({ domain: 'x.com', backlinks: 2 }), true);
    assert.equal(hasSummaryMetrics({ domain: 'x.com' }), false);
  });
});
