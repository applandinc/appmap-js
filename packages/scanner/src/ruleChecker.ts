import { Event } from '@appland/models';
import Check from './check';
import { AbortError } from './errors';
import { AppMapIndex, Finding } from './types';
import { verbose } from './rules/lib/util';
import ScopeIterator from './scope/scopeIterator';
import RootScope from './scope/rootScope';
import HTTPServerRequestScope from './scope/httpServerRequestScope';
import HTTPClientRequestScope from './scope/httpClientRequestScope';
import CommandScope from './scope/commandScope';
import SQLTransactionScope from './scope/sqlTransactionScope';
import CheckInstance from './checkInstance';
import { cloneEvent } from './eventUtil';
import HashV1 from './algorithms/hash/hashV1';
import HashV2 from './algorithms/hash/hashV2';
import ProgressReporter from './progressReporter';

export default class RuleChecker {
  private scopes: Record<string, ScopeIterator> = {
    root: new RootScope(),
    command: new CommandScope(),
    http_server_request: new HTTPServerRequestScope(),
    http_client_request: new HTTPClientRequestScope(),
    transaction: new SQLTransactionScope(),
  };

  constructor(private progress?: ProgressReporter) {}

  async check(
    appMapFileName: string,
    appMapIndex: AppMapIndex,
    check: Check,
    findings: Finding[]
  ): Promise<void> {
    if (verbose()) {
      console.warn(`Checking AppMap ${appMapIndex.appMap.name} with scope ${check.scope}`);
    }
    const scopeIterator = this.scopes[check.scope];
    if (!scopeIterator) {
      throw new AbortError(`Invalid scope name "${check.scope}"`);
    }

    const callEvents = function* (): Generator<Event> {
      const events = appMapIndex.appMap.events;
      for (let i = 0; i < events.length; i++) {
        yield events[i];
      }
    };

    for (const scope of scopeIterator.scopes(callEvents())) {
      if (verbose()) {
        console.warn(`Scope ${scope.scope}`);
      }

      if (this.progress) await this.progress.filterScope(check.scope, scope.scope);
      const checkInstance = new CheckInstance(check);
      if (!check.filterScope(scope.scope, appMapIndex)) {
        continue;
      }

      if (this.progress) await this.progress.enterScope(scope.scope);

      if (checkInstance.enumerateScope) {
        for (const event of scope.events()) {
          await this.checkEvent(
            event,
            scope.scope,
            appMapFileName,
            appMapIndex,
            checkInstance,
            findings
          );
        }
      } else {
        await this.checkEvent(
          scope.scope,
          scope.scope,
          appMapFileName,
          appMapIndex,
          checkInstance,
          findings
        );
      }

      if (this.progress) await this.progress.leaveScope();
    }
  }

  async checkEvent(
    event: Event,
    scope: Event,
    appMapFileName: string,
    appMapIndex: AppMapIndex,
    checkInstance: CheckInstance,
    findings: Finding[]
  ): Promise<void> {
    if (!event.isCall()) {
      return;
    }
    if (verbose()) {
      console.warn(
        `Asserting ${checkInstance.ruleId} on ${event.codeObject.fqid} event ${event.toString()}`
      );
    }

    if (!event.returnEvent) {
      if (verbose()) {
        console.warn(`\tEvent has no returnEvent. Skipping.`);
      }
      return;
    }

    if (this.progress) await this.progress.filterEvent(event);
    if (!checkInstance.filterEvent(event, appMapIndex)) {
      return;
    }

    const buildFinding = (
      matchEvent: Event,
      participatingEvents: Record<string, Event>,
      message?: string,
      groupMessage?: string,
      occurranceCount?: number,
      // matchEvent will be added to additionalEvents and participatingEvents.values
      // to create the relatedEvents array
      additionalEvents?: Event[]
    ): Finding => {
      const findingEvent = matchEvent || event;
      // Fixes:
      // TypeError: Cannot read property 'forEach' of undefined
      //   at hashHttp (/Users/kgilpin/source/appland/scanner/node_modules/@appland/models/dist/index.cjs:1663:11)
      //   at hashEvent (/Users/kgilpin/source/appland/scanner/node_modules/@appland/models/dist/index.cjs:1714:14)
      //   at Event.get hash [as hash] (/Users/kgilpin/source/appland/scanner/node_modules/@appland/models/dist/index.cjs:3325:27)
      findingEvent.message ||= [];
      const stack: string[] = [
        findingEvent.codeObject.location,
        ...findingEvent.ancestors().map((ancestor) => ancestor.codeObject.location),
      ].filter(Boolean);

      const hashV1 = new HashV1(
        checkInstance.ruleId,
        findingEvent,
        // findingEvent gets passed here as a relatedEvent, and if you look at HashV1 it
        // gets added to the hash again. That's how it worked in V1 so it's here for compatibility.
        additionalEvents || []
      );

      const hashV2 = new HashV2(checkInstance.ruleId, findingEvent, participatingEvents);

      const uniqueEvents = new Set<number>();
      const relatedEvents: Array<Event> = [];
      [findingEvent, ...(additionalEvents || []), ...Object.values(participatingEvents)]
        .map(cloneEvent)
        .forEach((event) => {
          if (uniqueEvents.has(event.id)) {
            return;
          }
          uniqueEvents.add(event.id);
          relatedEvents.push(cloneEvent(event));
        });

      return {
        appMapFile: appMapFileName,
        checkId: checkInstance.checkId,
        ruleId: checkInstance.ruleId,
        ruleTitle: checkInstance.title,
        event: cloneEvent(findingEvent),
        hash: hashV1.digest(),
        hash_v2: hashV2.digest(),
        stack,
        scope: cloneEvent(scope),
        message: message || checkInstance.title,
        groupMessage,
        occurranceCount,
        relatedEvents: relatedEvents.sort((event) => event.id),
        impactDomain: checkInstance.checkImpactDomain,
        participatingEvents: Object.fromEntries(
          Object.entries(participatingEvents).map(([k, v]) => [k, cloneEvent(v)])
        ),
      } as Finding;
    };

    if (this.progress) await this.progress.matchEvent(event, appMapIndex);
    const matchResult = await checkInstance.ruleLogic.matcher(
      event,
      appMapIndex,
      checkInstance.filterEvent.bind(checkInstance)
    );
    if (this.progress) await this.progress.matchResult(matchResult);
    const numFindings = findings.length;
    if (matchResult === true) {
      let finding;
      if (checkInstance.ruleLogic.message) {
        const message = checkInstance.ruleLogic.message(scope, event);
        finding = buildFinding(event, {}, message);
      } else {
        finding = buildFinding(event, {});
      }
      findings.push(finding);
    } else if (typeof matchResult === 'string') {
      const finding = buildFinding(event, {}, matchResult as string);
      finding.message = matchResult as string;
      findings.push(finding);
    } else if (matchResult) {
      matchResult.forEach((mr) => {
        const finding = buildFinding(
          mr.event,
          mr.participatingEvents || {},
          mr.message,
          mr.groupMessage,
          mr.occurranceCount,
          mr.relatedEvents
        );
        findings.push(finding);
      });
    }
    if (verbose()) {
      if (findings.length > numFindings) {
        findings.forEach((finding) =>
          console.log(`\tFinding: ${finding.ruleId} : ${finding.message}`)
        );
      }
    }
  }
}
