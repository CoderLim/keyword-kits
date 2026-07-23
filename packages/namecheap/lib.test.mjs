import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDomainPanelUrl,
  normalizeDomain,
  normalizeNameservers,
  toRows,
} from './lib.js';

describe('normalizeDomain', () => {
  it('accepts bare host and URL', () => {
    assert.equal(normalizeDomain('73-9.org'), '73-9.org');
    assert.equal(normalizeDomain('https://73-9.org/path'), '73-9.org');
    assert.equal(normalizeDomain('73-9.org.'), '73-9.org');
  });
  it('rejects empty/invalid', () => {
    assert.throws(() => normalizeDomain(''), /required/);
    assert.throws(() => normalizeDomain('nodot'), /invalid/);
  });
});

describe('normalizeNameservers', () => {
  it('parses comma/space lists', () => {
    assert.deepEqual(normalizeNameservers('ns1.cloudflare.com,ns2.cloudflare.com'), [
      'ns1.cloudflare.com',
      'ns2.cloudflare.com',
    ]);
    assert.deepEqual(normalizeNameservers('ns1.example.com ns2.example.com'), [
      'ns1.example.com',
      'ns2.example.com',
    ]);
  });
  it('enforces min and duplicates', () => {
    assert.throws(() => normalizeNameservers('only.one.com'), /at least 2/);
    assert.throws(
      () => normalizeNameservers('ns1.example.com,ns1.example.com'),
      /duplicate/,
    );
  });
});

describe('buildDomainPanelUrl / toRows', () => {
  it('builds panel URL', () => {
    assert.equal(
      buildDomainPanelUrl('73-9.org'),
      'https://ap.www.namecheap.com/domains/domaincontrolpanel/73-9.org/domain',
    );
  });
  it('maps rows', () => {
    const rows = toRows('73-9.org', ['ns1.x.com', 'ns2.x.com'], 'Successfully Saved');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].index, 1);
    assert.equal(rows[1].nameserver, 'ns2.x.com');
    assert.equal(rows[0].status, 'saved');
  });
});
