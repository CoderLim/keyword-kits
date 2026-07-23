import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_TLDS,
  buildDomains,
  formatDateYmd,
  mergeCheckMeta,
  normalizeKeyword,
  parseSseEvents,
  toRows,
} from './lib.js';

describe('normalizeKeyword', () => {
  it('trims, splits on whitespace, concatenates, lowercases', () => {
    assert.equal(normalizeKeyword('  AI Image  '), 'aiimage');
    assert.equal(normalizeKeyword('pdf'), 'pdf');
  });
  it('rejects empty', () => {
    assert.throws(() => normalizeKeyword('   '), /keyword/i);
    assert.throws(() => normalizeKeyword(''), /keyword/i);
  });
});

describe('buildDomains', () => {
  it('appends DEFAULT_TLDS in order', () => {
    const domains = buildDomains('aiimage');
    assert.equal(domains.length, DEFAULT_TLDS.length);
    assert.equal(domains[0], 'aiimage.com');
    assert.equal(domains[1], 'aiimage.ai');
    assert.equal(domains.at(-1), 'aiimage.top');
  });
});

describe('parseSseEvents', () => {
  it('parses shallow and whois events', () => {
    const raw = [
      'event: shallow-checked',
      'data: {"domain":"aiimage.io","meta":{"domain":"aiimage.io","existed":"yes","market":"https://atom.com"}}',
      'id: aiimage.io',
      '',
      'event: whois-cache-checked',
      'data: {"domain":"aiimage.io","meta":{"id":"aiimage.io","registered":"2023-12-13T17:45:27.168Z","expires":"2026-12-13T17:45:27.168Z","existed":"yes"}}',
      'id: aiimage.io',
      '',
      'event: [DONE]',
      'data: {"duration":100}',
      'id: [DONE]',
      '',
    ].join('\n');
    const events = parseSseEvents(raw);
    assert.equal(events.length, 3);
    assert.equal(events[0].event, 'shallow-checked');
    assert.equal(events[0].data.domain, 'aiimage.io');
  });
});

describe('mergeCheckMeta + toRows', () => {
  it('merges forSale from market and formats dates/year/dr', () => {
    const map = new Map();
    mergeCheckMeta(map, {
      event: 'shallow-checked',
      data: {
        domain: 'aiimage.io',
        meta: { domain: 'aiimage.io', existed: 'yes', market: 'https://atom.com' },
      },
    });
    mergeCheckMeta(map, {
      event: 'whois-cache-checked',
      data: {
        domain: 'aiimage.io',
        meta: {
          registered: '2023-12-13T17:45:27.168Z',
          expires: '2026-12-13T17:45:27.168Z',
          existed: 'yes',
        },
      },
    });
    const rows = toRows(['aiimage.io'], map, { 'aiimage.io': 0 });
    assert.deepEqual(rows[0], {
      domain: 'aiimage.io',
      year: '2023',
      dr: 0,
      forSale: true,
      registered: '2023-12-13',
      expires: '2026-12-13',
      existed: 'yes',
    });
  });

  it('uses null dr and empty dates when missing', () => {
    const map = new Map();
    const rows = toRows(['x.com'], map, {});
    assert.equal(rows[0].dr, null);
    assert.equal(rows[0].year, '');
    assert.equal(rows[0].registered, '');
    assert.equal(rows[0].forSale, false);
    assert.equal(rows[0].existed, '');
  });
});

describe('formatDateYmd', () => {
  it('formats ISO to YYYY-MM-DD', () => {
    assert.equal(formatDateYmd('2010-03-08T10:35:21Z'), '2010-03-08');
    assert.equal(formatDateYmd(''), '');
    assert.equal(formatDateYmd(undefined), '');
  });
});
