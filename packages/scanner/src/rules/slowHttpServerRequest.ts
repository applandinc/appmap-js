import { RuleLogic } from '../types';
import * as types from './types';
import parseRuleDescription from './lib/parseRuleDescription';
import RuleInstance from '../ruleInstance';

class Options implements types.SlowHTTPServerRequest.Options {
  public timeAllowed = 1;
}

function build(options: Options): RuleLogic {
  return {
    matcher: (e) => e.elapsedTime! > options.timeAllowed,
    message: () => `Slow HTTP server request (> ${options.timeAllowed * 1000}ms)`,
    where: (e) => !!e.httpServerRequest && e.elapsedTime !== undefined,
  };
}

const RULE: RuleInstance = {
  id: 'slow-http-server-request',
  title: 'Slow HTTP server request',
  scope: 'http_server_request',
  enumerateScope: false,
  impactDomain: 'Performance',
  description: parseRuleDescription('slowHttpServerRequest'),
  url: 'https://appland.com/docs/analysis/rules-reference.html#slow-http-server-request',
  Options,
  build,
};
export default RULE;
