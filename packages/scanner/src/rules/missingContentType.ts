import { Event } from '@appland/models';
import { RuleLogic } from '../types';
import { rpcRequestForEvent } from '@appland/openapi';
import parseRuleDescription from './lib/parseRuleDescription';
import RuleInstance from '../ruleInstance';

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);
const hasContent = (status: number) => status !== 204;

function build(): RuleLogic {
  function matcher(event: Event) {
    if (rpcRequestForEvent(event)!.responseContentType === undefined) {
      return `Missing HTTP content type in response to request: ${event.route}`;
    }
  }
  function where(e: Event) {
    return (
      !!e.httpServerResponse &&
      !isRedirect(e.httpServerResponse!.status) &&
      hasContent(e.httpServerResponse!.status)
    );
  }
  return {
    matcher,
    where,
  };
}

const RULE: RuleInstance = {
  id: 'missing-content-type',
  title: 'HTTP server request without a Content-Type header',
  scope: 'http_server_request',
  impactDomain: 'Stability',
  enumerateScope: false,
  description: parseRuleDescription('missingContentType'),
  url: 'https://appland.com/docs/analysis/rules-reference.html#missing-content-type',
  build,
};
export default RULE;
