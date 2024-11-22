import { strict as assert } from 'assert';
import sqlite3 from 'better-sqlite3';

import SnippetIndex, { SnippetId } from '../src/snippet-index';

describe('SnippetIndex', () => {
  let db: sqlite3.Database;
  let index: SnippetIndex;
  const directory = 'src';

  const snippet1: SnippetId = { type: 'code-snippet', id: 'test.txt:1' };
  const snippet2: SnippetId = { type: 'code-snippet', id: 'test2.txt:11' };
  const snippet3: SnippetId = { type: 'code-snippet', id: 'test3.txt:21' };
  const snippet4: SnippetId = { type: 'code-snippet', id: 'test4.txt:31' };

  beforeEach(() => {
    db = new sqlite3(':memory:');
    index = new SnippetIndex(db);
  });

  afterEach(() => {
    if (index) index.close();
  });

  it('should insert and search a snippet', () => {
    const content = 'symbol1 word1';
    index.indexSnippet(snippet1, directory, 'symbol1', 'word1', content);
    const results = index.searchSnippets('symbol1');
    assert.equal(results.length, 1);
    assert.equal(JSON.stringify(results[0].snippetId), JSON.stringify(snippet1));
    assert.equal(results[0].content, content);
  });

  it('should update the boost factor of a snippet', () => {
    const content = 'symbol2 word2';
    index.indexSnippet(snippet2, directory, 'symbol2', 'word2', content);
    index.boostSnippet(snippet2, 2.0);
    const results = index.searchSnippets('symbol2');
    assert.equal(results.length, 1);
    assert.equal(JSON.stringify(results[0].snippetId), JSON.stringify(snippet2));
  });

  it('should return results ordered by score', () => {
    index.indexSnippet(
      snippet3,
      directory,
      'symbol1 symbol3',
      'word1 word3',
      'symbol1 word1 symbol3 word3'
    );
    index.indexSnippet(
      snippet4,
      directory,
      'symbol2 symbol3',
      'word1 word4',
      'symbol2 word1 symbol3 word4'
    );

    let results = index.searchSnippets('word1 OR word4');
    assert.equal(results.length, 2);
    assert.equal(JSON.stringify(results[0].snippetId), JSON.stringify(snippet4));
    assert.equal(JSON.stringify(results[1].snippetId), JSON.stringify(snippet3));

    const unboostedScore = results[1].score;

    index.boostSnippet(snippet3, 2.0);

    results = index.searchSnippets('word1 OR word4');
    assert.equal(results.length, 2);
    assert.equal(JSON.stringify(results[0].snippetId), JSON.stringify(snippet3));
    assert.equal(JSON.stringify(results[1].snippetId), JSON.stringify(snippet4));

    const boostedScore = results[0].score;
    const scoreMultiple = boostedScore / unboostedScore;
    expect(scoreMultiple).toBeGreaterThan(1.99);
    expect(scoreMultiple).toBeLessThan(2.01);

    results = index.searchSnippets('symbol3');
    assert.equal(results.length, 2);
    assert.equal(JSON.stringify(results[0].snippetId), JSON.stringify(snippet3));
    assert.equal(JSON.stringify(results[1].snippetId), JSON.stringify(snippet4));
  });
});
