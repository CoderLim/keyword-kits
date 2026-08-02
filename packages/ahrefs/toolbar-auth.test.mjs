import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAuthorizeUrl,
  buildTbGetIconUrl,
  createPkce,
  isTokenValid,
  parseTbGetIconResponse,
} from './toolbar-auth.js';

describe('createPkce', () => {
  it('returns verifier and s256 challenge', () => {
    const { verifier, challenge } = createPkce();
    assert.ok(verifier.length >= 32);
    assert.ok(challenge.length >= 32);
    assert.notEqual(verifier, challenge);
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes toolbar client and PKCE params', () => {
    const url = buildAuthorizeUrl('chal', 'st');
    assert.match(url, /client_id=Ahrefs\+SEO\+Toolbar/);
    assert.match(url, /scope=tool-data/);
    assert.match(url, /code_challenge=chal/);
    assert.match(url, /code_challenge_method=S256/);
    assert.match(
      url,
      /redirect_uri=https%3A%2F%2Fhgmoccdbjhknikckedaaebbpdeebhiei\.chromiumapp\.org%2F/,
    );
  });
});

describe('buildTbGetIconUrl', () => {
  it('encodes target JSON', () => {
    const url = buildTbGetIconUrl('www.veed.io');
    assert.equal(
      url,
      'https://ahrefs.com/v4/tbGetIconV3?input=%7B%22target%22%3A%22www.veed.io%22%7D',
    );
  });
});

describe('parseTbGetIconResponse', () => {
  it('parses Ok envelope', () => {
    const stats = parseTbGetIconResponse(
      '["Ok",{"stats":{"domain_rating":86.0,"ahrefs_rank":4357,"url_rating":25}}]',
    );
    assert.equal(stats.domainRating, 86);
    assert.equal(stats.urlRating, 25);
    assert.equal(stats.ahrefsRank, 4357);
  });

  it('maps Forbidden to auth error', () => {
    assert.throws(
      () => parseTbGetIconResponse('["Error","Forbidden"]'),
      /re-run with --reauth|Forbidden/,
    );
  });
});

describe('isTokenValid', () => {
  it('rejects expired token', () => {
    assert.equal(
      isTokenValid({
        accessToken: 'x',
        expiresAt: Date.now() - 1000,
        obtainedAt: 0,
      }),
      false,
    );
  });

  it('accepts future token', () => {
    assert.equal(
      isTokenValid({
        accessToken: 'x',
        expiresAt: Date.now() + 60_000 * 60,
        obtainedAt: Date.now(),
      }),
      true,
    );
  });
});
