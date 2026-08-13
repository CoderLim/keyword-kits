import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrendingUrl,
  normalizeDays,
  normalizeExtractedRows,
  normalizeLimit,
  normalizeNonNegative,
  parseExtractedRows,
  releaseWindow,
  tablePageLength,
  titleToKeyword,
} from './new-trending-lib.js';

test('titleToKeyword takes the text before English or Chinese colon', () => {
  assert.equal(titleToKeyword('ReStory: Chill Electronics Repairs'), 'ReStory');
  assert.equal(titleToKeyword('DragonSword ： Awakening'), 'DragonSword');
});

test('titleToKeyword keeps colon-free names and removes trademark symbols', () => {
  assert.equal(titleToKeyword('Big Walk'), 'Big Walk');
  assert.equal(titleToKeyword('Overwatch®'), 'Overwatch');
});

test('releaseWindow uses UTC dates and subtracts the requested number of days', () => {
  assert.deepEqual(releaseWindow(30, new Date('2026-08-13T12:00:00Z')), {
    minRelease: '2026-07-14',
    maxRelease: '2026-08-13',
  });
});

test('buildTrendingUrl filters to games released in the requested window', () => {
  assert.equal(
    buildTrendingUrl({
      minRelease: '2026-07-14',
      maxRelease: '2026-08-13',
    }),
    'https://steamdb.info/stats/trendingfollowers/?displayOnly=Game&min_release=2026-07-14&max_release=2026-08-13',
  );
});

test('normalizeExtractedRows parses values, sorts gain descending, filters, and limits', () => {
  const rows = normalizeExtractedRows(
    [
      {
        appid: '2',
        name: 'Second: Subtitle',
        releaseDate: '2026-08-12',
        followers: '1,200',
        gain7d: '+500',
        rating: '80.50%',
      },
      {
        appid: '1',
        name: 'First®',
        releaseDate: '2026-08-11',
        followers: '5,000',
        gain7d: '+1,500',
        rating: '92.00%',
      },
      {
        appid: '3',
        name: 'Low Rated',
        releaseDate: '2026-08-10',
        followers: '900',
        gain7d: '+900',
        rating: '55.00%',
      },
    ],
    { minGain: 400, minRating: 60, limit: 2 },
  );

  assert.deepEqual(rows, [
    {
      rank: 1,
      appid: 1,
      keyword: 'First',
      name: 'First®',
      releaseDate: '2026-08-11',
      followers: 5000,
      gain7d: 1500,
      rating: 92,
      url: 'https://steamdb.info/app/1/',
    },
    {
      rank: 2,
      appid: 2,
      keyword: 'Second',
      name: 'Second: Subtitle',
      releaseDate: '2026-08-12',
      followers: 1200,
      gain7d: 500,
      rating: 80.5,
      url: 'https://steamdb.info/app/2/',
    },
  ]);
});

test('normalizeExtractedRows preserves missing ratings as null', () => {
  const [row] = normalizeExtractedRows(
    [
      {
        appid: '9',
        name: 'Coming Soon',
        releaseDate: '2026-08-13',
        followers: '100',
        gain7d: '+100',
        rating: '—',
      },
    ],
    { minGain: 0, minRating: 0, limit: 10 },
  );

  assert.equal(row.rating, null);
});

test('command numeric options accept valid values and reject invalid values', () => {
  assert.equal(normalizeDays('30'), 30);
  assert.equal(normalizeLimit('1000'), 1000);
  assert.equal(normalizeNonNegative('60.5', 'min-rating'), 60.5);
  assert.throws(() => normalizeDays(0), /days must be an integer/);
  assert.throws(() => normalizeLimit(1001), /limit must be an integer/);
  assert.throws(() => normalizeNonNegative(-1, 'min-gain'), /min-gain must be/);
});

test('tablePageLength renders only the smallest supported page that can satisfy the limit', () => {
  const supported = [25, 50, 100, -1];
  assert.equal(tablePageLength(1, []), null);
  assert.equal(tablePageLength(1, supported), 25);
  assert.equal(tablePageLength(26, supported), 50);
  assert.equal(tablePageLength(51, supported), 100);
  assert.equal(tablePageLength(100, supported), 100);
  assert.equal(tablePageLength(101, supported), -1);
  assert.throws(() => tablePageLength(101, [25, 50, 100]), /cannot satisfy limit/);
});

test('parseExtractedRows accepts browser JSON and rejects malformed JSON', () => {
  assert.deepEqual(parseExtractedRows('[{"appid":"1"}]'), [{ appid: '1' }]);
  assert.throws(() => parseExtractedRows('{'), /Failed to parse SteamDB table rows/);
});
