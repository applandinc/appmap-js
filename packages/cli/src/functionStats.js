// @ts-nocheck
const { analyzeQuery, obfuscate } = require('./database');
const { formatValue, formatHttpServerRequest } = require('./utils');

/** @typedef {import('./search/types').Trigram} Trigram */

/**
 *
 * @param {Trigram[]} trigrams
 * @returns {Trigram[]}
 */
function reduceTrigrams(trigrams) {
  const uniqueIds = new Set(trigrams.map((t) => t.id));
  const sortOrder = [...uniqueIds].sort().reduce((memo, id, index) => {
    memo[id] = index;
    return memo;
  }, {});

  return trigrams
    .filter((t) => {
      const newTrigram = uniqueIds.has(t.id);
      if (newTrigram) {
        uniqueIds.delete(t.id);
        return true;
      }
      return false;
    })
    .sort((a, b) => sortOrder[a.id] - sortOrder[b.id]);
}

class FunctionStats {
  /**
   *
   * @param {import('./search/types').EventMatch[]} eventMatches
   */
  constructor(eventMatches) {
    this.eventMatches = eventMatches;
  }

  toJSON() {
    const trigram = (/** @type {Trigram} */ t) =>
      [t.callerId, t.codeObjectId, t.calleeId].join(' ->\n');
    return {
      returnValues: this.returnValues,
      httpServerRequests: this.httpServerRequests,
      sqlQueries: this.sqlQueries,
      sqlTables: this.sqlTables,
      callers: this.callers,
      ancestors: this.ancestors,
      descendants: this.descendants,
      packageTrigrams: this.packageTrigrams.map(trigram),
      classTrigrams: this.classTrigrams.map(trigram),
      functionTrigrams: this.functionTrigrams.map(trigram),
    };
  }

  toComparableState() {
    const statusCodes = (eventMatches) =>
      eventMatches
        .filter((e) => e.event.returnEvent)
        .map((e) => e.event.httpServerResponse)
        .filter((res) => res)
        .map((res) => res.status || res.status_code);

    const exceptions = (eventMatches) =>
      eventMatches
        .map((e) => e.event)
        .filter((e) => e.isFunction)
        .filter((e) => e.exceptions)
        .map((e) => e.exceptions.map((exception) => exception.class))
        .flat();

    const callers = (eventMatches) =>
      eventMatches
        .map((e) => e.event)
        .map((e) => e.parent)
        .filter((e) => e)
        .map((e) => e.codeObject.id);

    const callees = (eventMatches) =>
      eventMatches
        .map((e) => e.event)
        .map((e) => e.children)
        .flat()
        .map((e) => e.codeObject.id);

    const functionParams = (eventMatches) =>
      eventMatches
        .map((e) => e.event)
        .filter((e) => e.isFunction)
        .map((e) => e.parameters.map((param) => param.name))
        .flat();

    const messageParams = (eventMatches) =>
      eventMatches
        .map((e) => e.event)
        .filter((e) => e.message)
        .map((e) => e.message.map((param) => param.name))
        .flat();

    const refs = (fn) => [...new Set(fn(this.eventMatches))].sort();

    const parameters = [functionParams, messageParams].map(refs).flat();

    return {
      returnValues: this.returnValues,
      parameters,
      exceptions: refs(exceptions),
      statusCodes: refs(statusCodes),
      callers: refs(callers),
      callees: refs(callees),
    };
  }

  get references() {
    const routes = (eventMatches) =>
      eventMatches
        .map((e) =>
          [e.event].concat(e.ancestors).filter((a) => a.httpServerRequest)
        )
        .flat()
        .map((e) =>
          JSON.stringify({
            type: 'route',
            name: [
              e.httpServerRequest.request_method,
              e.httpServerRequest.normalized_path_info,
            ].join(' '),
          })
        );

    const queries = (eventMatches) =>
      eventMatches
        .map((e) => [e.event].concat(e.descendants).filter((d) => d.sql))
        .flat()
        .map((e) =>
          JSON.stringify({
            type: 'query',
            name: obfuscate(e.sqlQuery, e.sql.database_type),
          })
        );

    const codeObjects = (eventMatches, type, property) =>
      eventMatches
        .map((e) => [e.event, e.event.parent].concat(e.event.children))
        .flat()
        .filter((e) => e && e.callEvent.isFunction && e.codeObject.id)
        .map((e) => e.codeObject)
        .map((co) =>
          JSON.stringify({
            type,
            name: property(co),
          })
        );

    const packages = (eventMatches) =>
      codeObjects(eventMatches, 'package', (co) => co.packageOf);

    const classes = (eventMatches) =>
      codeObjects(eventMatches, 'class', (co) =>
        [co.packageOf, co.classOf].join('/')
      );

    const functions = (eventMatches) =>
      codeObjects(eventMatches, 'function', (co) => co.id);

    const refs = (fn) => [...new Set(fn(this.eventMatches))].sort();

    return (
      [routes, queries, packages, classes, functions]
        .map(refs)
        .flat()
        // @ts-ignore
        .map(JSON.parse)
    );
  }

  get appMapNames() {
    return [...new Set(this.eventMatches.map((e) => e.appmap))].sort();
  }

  get returnValues() {
    return [
      ...new Set(
        this.eventMatches
          .filter((e) => e.event && e.event.returnEvent)
          .map((e) => e.event.returnValue)
          .map(formatValue)
      ),
    ].sort();
  }

  get httpServerRequests() {
    return [
      ...new Set(
        this.eventMatches
          .map((e) =>
            [e.event].concat(e.ancestors).filter((a) => a.httpServerRequest)
          )
          .flat()
          .filter((e) => e)
          .map((e) => formatHttpServerRequest(e))
      ),
    ].sort();
  }

  get sqlQueries() {
    return [
      ...new Set(
        this.eventMatches
          .map((e) => [e.event].concat(e.descendants).filter((d) => d.sql))
          .flat()
          .map((e) => obfuscate(e.sqlQuery, e.sql.database_type))
      ),
    ].sort();
  }

  get sqlTables() {
    return [
      ...new Set(
        this.eventMatches
          .map((e) => [e.event].concat(e.descendants).filter((d) => d.sql))
          .flat()
          .map((e) => analyzeQuery(e.sql))
          .filter((e) => typeof e === 'object')
          .map((sql) => sql.tables)
          .flat()
      ),
    ].sort();
  }

  get callers() {
    return [
      ...new Set(
        this.eventMatches
          .map((e) => e.caller)
          .filter((e) => e)
          .map((e) => e.callEvent.isFunction && e.codeObject.id)
          .filter((e) => e)
      ),
    ];
  }

  get ancestors() {
    return [
      ...new Set(
        this.eventMatches
          .map((e) => e.ancestors)
          .filter((list) => list.length > 0)
          .map((list) =>
            list.map((e) => e.callEvent.isFunction && e.codeObject.id)
          )
          .flat()
          .filter((e) => e)
      ),
    ];
  }

  get descendants() {
    return [
      ...new Set(
        this.eventMatches
          .map((e) => e.descendants)
          .filter((list) => list.length > 0)
          .map((list) =>
            list.map((e) => e.callEvent.isFunction && e.codeObject.id)
          )
          .flat()
          .filter((e) => e)
      ),
    ];
  }

  get packageTrigrams() {
    return reduceTrigrams(
      this.eventMatches.map((e) => e.packageTrigrams).flat()
    );
  }

  get classTrigrams() {
    return reduceTrigrams(this.eventMatches.map((e) => e.classTrigrams).flat());
  }

  get functionTrigrams() {
    return reduceTrigrams(
      this.eventMatches.map((e) => e.functionTrigrams).flat()
    );
  }
}

module.exports = FunctionStats;
