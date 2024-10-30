import { strict as assert } from 'assert';
import sqlite3 from 'better-sqlite3';
import FileIndex, { FileSearchResult } from '../src/file-index';

describe('FileIndex', () => {
  let db: sqlite3.Database;
  let index: FileIndex;
  const directory = 'src';

  beforeEach(() => {
    db = new sqlite3(':memory:');
    index = new FileIndex(db);
  });

  afterEach(() => {
    if (index) index.close();
  });

  it('should insert and search a file', () => {
    index.indexFile(directory, 'test.txt', 'symbol1', 'word1');
    const results = index.search('symbol1');
    assert.equal(results.length, 1);
    assert.equal(results[0].filePath, 'test.txt');
  });

  it('should update the boost factor of a file', () => {
    index.indexFile(directory, 'test2.txt', 'symbol2', 'word2');
    index.boostFile('test2.txt', 2.0);
    const results = index.search('symbol2');
    expect(results.map((r: FileSearchResult) => r.directory)).toEqual([directory]);
    expect(results.map((r: FileSearchResult) => r.filePath)).toEqual(['test2.txt']);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should return results ordered by score', () => {
    index.indexFile(directory, 'test3.txt', 'symbol1 symbol3', 'word1 word3');
    index.indexFile(directory, 'test4.txt', 'symbol2 symbol3', 'word1 word4');
    index.boostFile('test4.txt', 2.0);

    let results = index.search('word1');
    expect(results.map((r: FileSearchResult) => r.filePath)).toEqual(['test4.txt', 'test3.txt']);

    results = index.search('symbol3');
    expect(results.map((r: FileSearchResult) => r.filePath)).toEqual(['test4.txt', 'test3.txt']);

    results = index.search('symbol2');
    expect(results.map((r: FileSearchResult) => r.filePath)).toEqual(['test4.txt']);
  });
});
