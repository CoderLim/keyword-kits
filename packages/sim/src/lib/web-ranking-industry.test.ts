import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  listIndustries,
  resolveIndustryId,
} from './web-ranking-industry.ts';

describe('resolveIndustryId', () => {
  it('defaults empty / All / all to All', () => {
    assert.equal(resolveIndustryId(undefined), 'All');
    assert.equal(resolveIndustryId(''), 'All');
    assert.equal(resolveIndustryId('All'), 'All');
    assert.equal(resolveIndustryId('all'), 'All');
  });

  it('resolves mapped industries case-insensitively', () => {
    assert.equal(resolveIndustryId('Games'), 'Games');
    assert.equal(resolveIndustryId('games'), 'Games');
    assert.equal(resolveIndustryId('游戏'), 'Games');

    assert.equal(resolveIndustryId('Soccer'), 'Sports~Soccer');
    assert.equal(resolveIndustryId('soccer'), 'Sports~Soccer');
    assert.equal(resolveIndustryId('足球'), 'Sports~Soccer');

    assert.equal(resolveIndustryId('AI Chatbots and Tools'), 'AI_Chatbots_and_Tools');
    assert.equal(resolveIndustryId('ai chatbots and tools'), 'AI_Chatbots_and_Tools');
    assert.equal(resolveIndustryId('AI_Chatbots_and_Tools'), 'AI_Chatbots_and_Tools');
  });

  it('throws ArgumentError for unknown industry and lists known keys including All', () => {
    assert.throws(
      () => resolveIndustryId('not-a-real-industry-xyz'),
      (err: Error) => {
        assert.match(err.message, /unknown industry/i);
        assert.match(err.message, /All/i);
        return true;
      },
    );
  });
});

describe('listIndustries', () => {
  it('includes All', () => {
    assert.ok(listIndustries().includes('All'));
  });
});
