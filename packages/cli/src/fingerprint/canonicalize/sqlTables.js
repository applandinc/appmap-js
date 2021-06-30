/* eslint-disable class-methods-use-this */
const { analyzeQuery } = require('../../database');
const Unique = require('./unique');

/**
 * At INFO level, the order of labeled function calls matters. SQL query strings
 * are collected, sorted and made unique.
 */
class Canonicalize extends Unique {
  /**
   *
   * @param {Event} event
   */
  sql(event) {
    const analyzedQuery = analyzeQuery(event.sql);
    if (typeof analyzedQuery === 'object') {
      return analyzedQuery.tables;
    }

    return null;
  }
}

module.exports = (appmap) => new Canonicalize(appmap).execute();
