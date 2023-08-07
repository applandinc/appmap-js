import { Event } from '@appland/models';
import { MatchResult, RuleLogic } from '../types';
import SecretsRegexes, { looksSecret } from '../analyzer/secretsRegexes';
import { emptyValue } from './lib/util';
import recordSecrets, { Secret } from '../analyzer/recordSecrets';
import { URL } from 'url';
import parseRuleDescription from './lib/parseRuleDescription';
import RuleInstance from '../ruleInstance';

class Match {
  private constructor(
    public pattern: RegExp | string,
    public value: string,
    public generatorEvent?: Event
  ) {}

  static fromPattern(pattern: RegExp, value: string): Match {
    return new Match(pattern, value);
  }

  static fromSecret(secret: Secret, value: string): Match {
    return new Match(secret.value, value, secret.generatorEvent);
  }
}

const secrets: Secret[] = [];

const findInLog = (event: Event): MatchResult[] | undefined => {
  if (!event.parameters) return;

  const matches: Match[] = [];

  for (const { value } of event.parameters) {
    if (emptyValue(value)) continue;

    if (looksSecret(value)) {
      // Only look for the exact matching regexes if it matches the catchall regex
      matches.push(
        ...Object.values(SecretsRegexes)
          .flat()
          .filter((re) => re.test(value))
          .map((re) => Match.fromPattern(re, value))
      );
    }

    for (const secret of secrets) {
      if (value.includes(secret.value)) {
        matches.push(Match.fromSecret(secret, value));
      }
    }
  }

  if (matches.length > 0) {
    return matches.map((match) => {
      const { pattern, value } = match;
      const participatingEvents: Record<string, Event> = {};
      if (match.generatorEvent) {
        participatingEvents.generatorEvent = match.generatorEvent;
      }
      return {
        event,
        message: `Log message contains secret ${
          match.generatorEvent ? match.generatorEvent.codeObject.prettyName || 'data' : 'data'
        } "${pattern}": ${value}`,
        participatingEvents,
      };
    });
  }
};

function build(): RuleLogic {
  return {
    matcher: (e) => {
      if (e.codeObject.labels.has(Secret)) {
        recordSecrets(secrets, e);
      }
      if (e.codeObject.labels.has(Log)) {
        return findInLog(e);
      }
    },
    where: (e) => {
      return e.codeObject.labels.has(Log) || e.codeObject.labels.has(Secret);
    },
  };
}

const Secret = 'secret';
const Log = 'log';

const RULE: RuleInstance = {
  id: 'secret-in-log',
  title: 'Secret in log',
  labels: [Secret, Log],
  scope: 'root',
  impactDomain: 'Security',
  enumerateScope: true,
  references: {
    'CWE-532': new URL('https://cwe.mitre.org/data/definitions/532.html'),
  },
  description: parseRuleDescription('secretInLog'),
  url: 'https://appland.com/docs/analysis/rules-reference.html#secret-in-log',
  build,
};
export default RULE;
