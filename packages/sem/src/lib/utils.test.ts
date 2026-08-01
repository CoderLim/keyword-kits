import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOverviewUrl,
  normalizeDomain,
  parseDr,
} from './utils.ts';

describe('normalizeDomain', () => {
  it('strips protocol and path', () => {
    assert.equal(normalizeDomain('https://www.raphael.app/path?x=1'), 'raphael.app');
  });

  it('lowercases host', () => {
    assert.equal(normalizeDomain('Raphael.APP'), 'raphael.app');
  });

  it('rejects empty', () => {
    assert.throws(() => normalizeDomain(''), /domain is required/);
  });

  it('rejects invalid', () => {
    assert.throws(() => normalizeDomain('nodot'), /invalid domain/);
  });
});

describe('buildOverviewUrl', () => {
  it('builds overview deep-link without fid/gmitm', () => {
    assert.equal(
      buildOverviewUrl('raphael.app'),
      'https://sem.3ue.com/analytics/overview/?searchType=domain&q=raphael.app&protocol=https',
    );
  });
});

describe('parseDr', () => {
  it('parses integer AS', () => {
    assert.equal(parseDr('41'), 41);
  });

  it('returns null for empty', () => {
    assert.equal(parseDr(''), null);
    assert.equal(parseDr(null), null);
  });
});
