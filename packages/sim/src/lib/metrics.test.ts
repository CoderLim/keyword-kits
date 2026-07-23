import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCpc, parseDifficulty, parseVolume } from './metrics.ts';

describe('parseVolume', () => {
  it('parses plain integers', () => {
    assert.equal(parseVolume('1200'), 1200);
  });
  it('parses K/M suffixes', () => {
    assert.equal(parseVolume('1.2K'), 1200);
    assert.equal(parseVolume('3.5M'), 3_500_000);
  });
  it('returns null for empty / dash / N/A', () => {
    assert.equal(parseVolume('-'), null);
    assert.equal(parseVolume('N/A'), null);
    assert.equal(parseVolume(''), null);
  });
  it('parses recon sample values', () => {
    assert.equal(parseVolume('699.5K'), 699_500);
  });
});

describe('parseCpc', () => {
  it('strips currency symbols', () => {
    assert.equal(parseCpc('$0.45'), 0.45);
    assert.equal(parseCpc('0.45'), 0.45);
  });
  it('returns null for unparseable', () => {
    assert.equal(parseCpc('-'), null);
  });
  it('parses recon sample values', () => {
    assert.equal(parseCpc('$0.81'), 0.81);
  });
});

describe('parseDifficulty', () => {
  it('parses integers and percents', () => {
    assert.equal(parseDifficulty('42'), 42);
    assert.equal(parseDifficulty('42%'), 42);
  });
  it('returns null for unparseable', () => {
    assert.equal(parseDifficulty('N/A'), null);
  });
  it('parses recon sample values', () => {
    assert.equal(parseDifficulty('78'), 78);
  });
});
