import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BASE_URL,
  BULK_PATH,
  buildBulkUrl,
  mapTraffic,
  mapWhois,
  normalizeDomain,
  normalizeParams,
  parseSseEvents,
  randomNonce,
  sign,
} from './lib.ts';

describe('normalizeDomain', () => {
  it('strips scheme/path and lowercases', () => {
    assert.equal(normalizeDomain('https://www.ahrefs.com/pricing'), 'ahrefs.com');
    assert.equal(normalizeDomain('Ahrefs.COM/'), 'ahrefs.com');
  });
  it('rejects empty', () => {
    assert.throws(() => normalizeDomain(''), /domain/i);
    assert.throws(() => normalizeDomain('   '), /domain/i);
  });
});

describe('randomNonce', () => {
  it('is 16 alphanumeric chars', () => {
    const n = randomNonce();
    assert.equal(n.length, 16);
    assert.match(n, /^[A-Za-z0-9]{16}$/);
  });
  it('differs across calls', () => {
    assert.notEqual(randomNonce(), randomNonce());
  });
});

describe('normalizeParams', () => {
  it('sorts keys and values', () => {
    assert.equal(
      normalizeParams({ view: 'full', domain: 'x.io', stream: 'true' }),
      'domain=x.io&stream=true&view=full',
    );
  });
  it('matches the bulk canonical order', () => {
    assert.equal(
      normalizeParams({
        domain: 'websitecloner.io',
        stream: 'true',
        view: 'full',
      }),
      'domain=websitecloner.io&stream=true&view=full',
    );
  });
});

describe('sign', () => {
  it('reproduces the exact signature from a live request', () => {
    // Captured from the AITDK extension (verified against wapi.aitdk.com).
    const sig = sign(
      'GET',
      '/api/v1/bulk',
      { domain: 'websitecloner.io', stream: 'true', view: 'full' },
      '1785918242',
      '4xUYpeqPcxQD0RBU',
    );
    assert.equal(
      sig,
      'c4aea28f9a79a278254ac866f45222edafcd43a251255257905aa9143bdc86cb',
    );
  });
});

describe('buildBulkUrl', () => {
  it('contains required query params and signed URL', () => {
    const url = buildBulkUrl('ahrefs.com', {
      timestamp: '1785918242',
      nonce: '4xUYpeqPcxQD0RBU',
    });
    assert.ok(url.startsWith(`${BASE_URL}${BULK_PATH}?`));
    const u = new URL(url);
    assert.equal(u.searchParams.get('domain'), 'ahrefs.com');
    assert.equal(u.searchParams.get('stream'), 'true');
    assert.equal(u.searchParams.get('view'), 'full');
    assert.equal(u.searchParams.get('nonce'), '4xUYpeqPcxQD0RBU');
    assert.equal(u.searchParams.get('timestamp'), '1785918242');
    assert.match(u.searchParams.get('signature')!, /^[0-9a-f]{64}$/);
  });
});

describe('parseSseEvents', () => {
  it('parses whois/traffic/complete events', () => {
    const text = [
      'event: whois',
      'data: {"domain":"x.com","data":{"events":[{"eventAction":"registration","eventDate":"2010-11-25T15:32:54Z"}]}}',
      '',
      'event: traffic',
      'data: {"domain":"x.com","data":{"overview":{"visits":"100","globalRank":5}}}',
      '',
      'event: complete',
      'data: {"status":"DONE","duration":14}',
      '',
      '',
    ].join('\n');
    const evs = parseSseEvents(text);
    assert.equal(evs.length, 3);
    assert.equal(evs[0]!.event, 'whois');
    assert.equal(evs[1]!.event, 'traffic');
    assert.equal(evs[2]!.event, 'complete');
    assert.equal((evs[2]!.data as { status: string }).status, 'DONE');
  });
});

describe('mapWhois', () => {
  it('extracts registrar, dates, nameservers', () => {
    const w = mapWhois({
      events: [
        { eventAction: 'registration', eventDate: '2010-11-25T15:32:54Z' },
        { eventAction: 'expiration', eventDate: '2029-11-25T15:32:54Z' },
        { eventAction: 'last changed', eventDate: '2020-03-26T06:21:50Z' },
      ],
      nameservers: [{ ldhName: 'ADAM.NS.CLOUDFLARE.COM' }],
      entities: [
        {
          roles: ['registrar'],
          vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'Name.com, Inc.']]],
        },
      ],
      status: ['client transfer prohibited'],
    });
    assert.equal(w.registrar, 'Name.com, Inc.');
    assert.equal(w.registered, '2010-11-25');
    assert.equal(w.expires, '2029-11-25');
    assert.equal(w.updated, '2020-03-26');
    assert.deepEqual(w.nameservers, ['adam.ns.cloudflare.com']);
    assert.deepEqual(w.status, ['client transfer prohibited']);
  });
});

describe('mapTraffic', () => {
  it('parses overview scalars and passes through nested', () => {
    const t = mapTraffic({
      title: 'Example',
      description: 'desc',
      overview: {
        visits: '6568868',
        globalRank: 10901,
        countryRank: 17048,
        bounceRate: '0.6685541180',
        pagePerVisit: '1.923456',
        timeOnSite: '108.2105',
        month: '6',
        year: '2026',
      },
      trafficSources: { direct: 0.6137, searchOrganic: 0.2662 },
      topKeywords: [{ name: 'ahrefs', volume: 711750 }],
      topRegions: [{ name: 'United States', value: 0.18 }],
      aiTraffic: {
        trends: [
          { name: 'chatgpt.com', history: [{ date: '2026-05-01', value: 66.7 }, { date: '2026-06-01', value: 72.87 }] },
        ],
      },
      monthlyVisits: { '2026-06-01': 7754682 },
    });
    assert.equal(t.title, 'Example');
    assert.equal(t.overview.visits, 6568868);
    assert.equal(t.overview.globalRank, 10901);
    assert.equal(t.overview.bounceRate, 0.6686);
    assert.equal(t.overview.pagePerVisit, 1.92);
    assert.equal(t.overview.timeOnSite, 108);
    assert.equal(t.overview.dataMonth, '6');
    assert.equal(t.overview.dataYear, '2026');
    assert.deepEqual(t.trafficSources, { direct: 0.6137, searchOrganic: 0.2662 });
    assert.equal(t.aiTraffic[0]!.name, 'chatgpt.com');
    assert.equal(t.aiTraffic[0]!.value, 72.87); // latest by date
    assert.equal(t.monthlyVisits['2026-06-01'], 7754682);
  });
});
