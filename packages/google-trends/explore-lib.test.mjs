import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildExploreReq,
  extractWidgets,
  findRelatedQueryWidgets,
  findTimeseriesWidget,
  keywordFromRelatedWidget,
  normalizeKeywords,
  parseMultilineInterest,
  parseRelatedSearches,
  parseTrendsJson,
} from './explore-lib.js';

describe('normalizeKeywords', () => {
  it('collects positional keywords', () => {
    assert.deepEqual(
      normalizeKeywords({ keyword: 'a', keyword2: 'b', keyword3: 'c' }),
      ['a', 'b', 'c'],
    );
  });

  it('splits comma-separated single arg', () => {
    assert.deepEqual(normalizeKeywords({ keyword: 'pdf to jpg, jpg to pdf' }), [
      'pdf to jpg',
      'jpg to pdf',
    ]);
  });

  it('accepts exactly 5 positionals', () => {
    assert.deepEqual(
      normalizeKeywords({
        keyword: '1',
        keyword2: '2',
        keyword3: '3',
        keyword4: '4',
        keyword5: '5',
      }),
      ['1', '2', '3', '4', '5'],
    );
  });

  it('rejects more than 5 via comma list', () => {
    assert.throws(
      () => normalizeKeywords({ keyword: 'a,b,c,d,e,f' }),
      /at most 5/,
    );
  });

  it('requires at least one', () => {
    assert.throws(() => normalizeKeywords({}), /at least one/);
  });
});

describe('parseTrendsJson + widgets', () => {
  const exploreBody = `)]}'
{"widgets":[
  {"id":"TIMESERIES","token":"tok-ts","request":{"time":"2025-01-01 2026-01-01"}},
  {"id":"RELATED_QUERIES_0","token":"tok-r0","request":{"restriction":{"complexKeywordsRestriction":{"keyword":[{"type":"BROAD","value":"alpha"}]}}}},
  {"id":"RELATED_QUERIES_1","token":"tok-r1","request":{"restriction":{"complexKeywordsRestriction":{"keyword":[{"type":"BROAD","value":"beta"}]}}}},
  {"id":"RELATED_TOPICS","token":"tok-t","request":{}}
]}`;

  it('strips XSSI and extracts widgets', () => {
    const payload = parseTrendsJson(exploreBody);
    const widgets = extractWidgets(payload);
    assert.equal(widgets.length, 4);
    const ts = findTimeseriesWidget(widgets);
    assert.equal(ts.token, 'tok-ts');
    const related = findRelatedQueryWidgets(widgets);
    assert.equal(related.length, 2);
    assert.equal(keywordFromRelatedWidget(related[0], 0, ['alpha', 'beta']), 'alpha');
    assert.equal(keywordFromRelatedWidget(related[1], 1, ['alpha', 'beta']), 'beta');
  });
});

describe('parseMultilineInterest', () => {
  it('maps multi-series values', () => {
    const body = `)]}'
{"default":{"timelineData":[
  {"time":"1","formattedTime":"Jan 1","value":[10,20]},
  {"time":"2","formattedTime":"Jan 8","value":[30]}
]}}`;
    const points = parseMultilineInterest(body, 2);
    assert.equal(points.length, 2);
    assert.deepEqual(points[0].values, [10, 20]);
    assert.deepEqual(points[1].values, [30, null]);
  });
});

describe('parseRelatedSearches', () => {
  it('maps top and rising lists', () => {
    const body = `)]}'
{"default":{"rankedList":[
  {"rankedKeyword":[{"query":"top a","value":100},{"query":"top b","value":50}]},
  {"rankedKeyword":[{"query":"rise a","value":"Breakout","formattedValue":"Breakout"},{"query":"rise b","value":180,"formattedValue":"+180%"}]}
]}}`;
    const block = parseRelatedSearches(body, 'seed');
    assert.equal(block.keyword, 'seed');
    assert.deepEqual(block.top, [
      { query: 'top a', value: 100 },
      { query: 'top b', value: 50 },
    ]);
    assert.equal(block.rising[0].query, 'rise a');
    assert.equal(block.rising[1].query, 'rise b');
    assert.equal(block.rising[1].value, 180);
  });
});

describe('buildExploreReq', () => {
  it('builds comparisonItem payload', () => {
    const raw = buildExploreReq(['a', 'b'], 'US', 'today 12-m');
    assert.deepEqual(JSON.parse(raw), {
      comparisonItem: [
        { keyword: 'a', geo: 'US', time: 'today 12-m' },
        { keyword: 'b', geo: 'US', time: 'today 12-m' },
      ],
      category: 0,
      property: '',
    });
  });
});
