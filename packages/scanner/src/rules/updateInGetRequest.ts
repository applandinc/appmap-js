import { Event } from '@appland/models';
import { RuleLogic } from '../types';
import { toRegExpArray } from './lib/util';
import parseRuleDescription from './lib/parseRuleDescription';
import assert from 'assert';
import RuleInstance from '../ruleInstance';

class Options {
  private _queryInclude: RegExp[];
  private _queryExclude: RegExp[];

  constructor(
    queryInclude: RegExp[] = [/\binsert\b/i, /\bupdate\b/i],
    queryExclude: RegExp[] = []
  ) {
    this._queryInclude = queryInclude;
    this._queryExclude = queryExclude;
  }

  get queryInclude(): RegExp[] {
    return this._queryInclude;
  }

  set queryInclude(value: string[] | RegExp[]) {
    this._queryInclude = toRegExpArray(value);
  }

  get queryExclude(): RegExp[] {
    return this._queryExclude;
  }

  set queryExclude(value: string[] | RegExp[]) {
    this._queryExclude = toRegExpArray(value);
  }
}

function build(options: Options = new Options()): RuleLogic {
  return {
    matcher: (e) => {
      let httpServerRequest: Event | undefined;
      function hasHttpServerRequest() {
        httpServerRequest = e
          .ancestors()
          .find(
            (ancestor) =>
              ancestor.httpServerRequest &&
              ['head', 'get'].includes(ancestor.httpServerRequest.request_method.toLowerCase())
          );
        return httpServerRequest !== undefined;
      }

      if (
        options.queryInclude.some((pattern) => e.sqlQuery!.match(pattern)) &&
        !options.queryExclude.some((pattern) => e.sqlQuery!.match(pattern)) &&
        !e.ancestors().some((ancestor) => ancestor.codeObject.labels.has(Audit)) &&
        hasHttpServerRequest()
      ) {
        assert(httpServerRequest, 'HTTP server request is undefined');
        return [
          {
            event: e,
            message: `Data update performed in HTTP request ${httpServerRequest.route}: ${e.sqlQuery}`,
            participatingEvents: { request: httpServerRequest },
          },
        ];
      }
    },
    where: (e) => !!e.sqlQuery,
  };
}

const Audit = 'audit';

const RULE: RuleInstance = {
  id: 'update-in-get-request',
  title: 'Data update performed in GET or HEAD request',
  scope: 'http_server_request',
  enumerateScope: true,
  labels: [Audit],
  impactDomain: 'Maintainability',
  description: parseRuleDescription('updateInGetRequest'),
  url: 'https://appland.com/docs/analysis/rules-reference.html#update-in-get-request',
  Options,
  build,
};
export default RULE;
