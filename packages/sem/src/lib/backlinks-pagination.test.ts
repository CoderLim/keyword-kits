import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const pagination = await import('./backlinks-pagination.ts').catch(() => ({}));

describe('appendUniqueRows', () => {
  it('keeps UI order, removes duplicates, and stops at the limit', () => {
    assert.equal(typeof pagination.appendUniqueRows, 'function');

    const accumulated = [{ id: 'a' }];
    const seen = new Set(['a']);
    pagination.appendUniqueRows(
      accumulated,
      seen,
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      (row: { id: string }) => row.id,
      2,
    );

    assert.deepEqual(accumulated, [{ id: 'a' }, { id: 'b' }]);
    assert.deepEqual([...seen], ['a', 'b']);
  });
});

describe('rowsFingerprint', () => {
  it('changes when the visible page changes', () => {
    assert.equal(typeof pagination.rowsFingerprint, 'function');
    const keyOf = (row: { id: string }) => row.id;

    assert.notEqual(
      pagination.rowsFingerprint([{ id: 'a' }], keyOf),
      pagination.rowsFingerprint([{ id: 'b' }], keyOf),
    );
  });
});

describe('backlinkIdentity', () => {
  it('ignores mutable presentation fields when URLs identify the backlink', () => {
    assert.equal(typeof pagination.backlinkIdentity, 'function');
    const first = pagination.backlinkIdentity({
      sourceUrl: 'https://source.test/page',
      targetUrl: 'https://target.test/',
      anchor: 'Example',
      sourceTitle: 'Loading…',
      firstSeen: 'Jan 1',
    });
    const hydrated = pagination.backlinkIdentity({
      sourceUrl: 'https://source.test/page',
      targetUrl: 'https://target.test/',
      anchor: 'Example',
      sourceTitle: 'Final title',
      firstSeen: 'Jan 2',
    });

    assert.equal(first, hydrated);
  });
});

describe('parseHasNextState', () => {
  it('rejects malformed pagination state instead of treating it as the last page', () => {
    assert.equal(typeof pagination.parseHasNextState, 'function');
    assert.throws(() => pagination.parseHasNextState('not-json'));
    assert.throws(() => pagination.parseHasNextState('{}'));
    assert.equal(pagination.parseHasNextState('{"hasNext":false}'), false);
  });
});
