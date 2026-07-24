import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWebRankingUrl,
  normalizeSort,
  SORT_VIA_URL,
} from './web-ranking-url.ts';

function stripTimestampQuery(qs: string): string {
  const params = new URLSearchParams(qs);
  params.delete('_');
  return params.toString();
}

describe('normalizeSort', () => {
  it('defaults to change', () => {
    assert.equal(normalizeSort(undefined), 'change');
    assert.equal(normalizeSort(''), 'change');
    assert.equal(normalizeSort('change'), 'change');
  });

  it('accepts visits aliases', () => {
    assert.equal(normalizeSort('visits'), 'visits');
    assert.equal(normalizeSort('monthlyVisits'), 'visits');
    assert.equal(normalizeSort('每月访问量'), 'visits');
  });

  it('accepts change aliases', () => {
    assert.equal(normalizeSort('变动'), 'change');
  });

  it('rejects unknown sort', () => {
    assert.throws(() => normalizeSort('traffic'), /unknown sort/i);
  });
});

describe('buildWebRankingUrl', () => {
  it('builds All / 1m / CategoryLeadersSearch base', () => {
    const url = buildWebRankingUrl({ industryId: 'All', sort: 'change' });
    assert.match(url, /webmarketanalysis\/rankings\/All\/999\/1m/);
    assert.match(url, /webSource=Total/);
    assert.match(url, /selectedTab=CategoryLeadersSearch/);
    assert.match(url, /_=\d+/);
    assert.doesNotMatch(url, /Organic|SearchType|自然/i);
  });

  it('injects industry path id', () => {
    const url = buildWebRankingUrl({ industryId: 'Games', sort: 'change' });
    assert.match(url, /webmarketanalysis\/rankings\/Games\/999\/1m/);
  });

  it('does not encode sort in URL when SORT_VIA_URL is false', () => {
    assert.equal(SORT_VIA_URL, false);

    const changeUrl = buildWebRankingUrl({ industryId: 'All', sort: 'change' });
    const visitsUrl = buildWebRankingUrl({ industryId: 'All', sort: 'visits' });

    for (const url of [changeUrl, visitsUrl]) {
      assert.match(url, /webmarketanalysis\/rankings\/All\/999\/1m/);
      assert.match(url, /webSource=Total/);
      assert.match(url, /selectedTab=CategoryLeadersSearch/);
      assert.doesNotMatch(url, /sort=|order=|MoMChange|AvgMonthVisits/i);
    }

    const changeQs = changeUrl.split('?')[1]!;
    const visitsQs = visitsUrl.split('?')[1]!;
    assert.equal(stripTimestampQuery(changeQs), stripTimestampQuery(visitsQs));
  });
});
