import { buildAppMap } from '@appland/models';
import { readFile } from 'fs/promises';
import HashV2 from '../../src/algorithms/hash/hashV2';
import Check from '../../src/check';
import rule from '../../src/rules/authzBeforeAuthn';
import { fixtureAppMapFileName, scan } from '../util';

it('authentication precedes authentication', async () => {
  const { findings } = await scan(new Check(rule), 'Test_authz_before_authn.appmap.json');
  expect(findings).toHaveLength(0);
});

it('authorization before (or without) authentication', async () => {
  // Remove security.authentication labels from the AppMap in order to
  // trigger the finding.
  const appMapBytes = await readFile(
    fixtureAppMapFileName('Test_authz_before_authn.appmap.json'),
    'utf8'
  );
  const baseAppMap = JSON.parse(appMapBytes);
  const removeAuthenticationLabel = (codeObject: any) => {
    if (codeObject.labels) {
      codeObject.labels = codeObject.labels.filter(
        (label: string) => label !== 'security.authentication'
      );
    }
    (codeObject.children || []).forEach(removeAuthenticationLabel);
  };
  baseAppMap.classMap.forEach(removeAuthenticationLabel);
  const appMapData = buildAppMap(JSON.stringify(baseAppMap)).normalize().build();

  const { appMap, findings } = await scan(
    new Check(rule),
    fixtureAppMapFileName('Test_authz_before_authn.appmap.json'),
    appMapData
  );
  expect(findings).toHaveLength(1);
  const finding = findings[0];
  const findingEvent = appMap.events.find((e) => e.id === finding.event.id)!;
  expect(
    new HashV2(finding.ruleId, findingEvent, finding.participatingEvents || {}).canonicalString
  ).toEqual(`algorithmVersion=2
rule=authz-before-authn
findingEvent.event_type=function
findingEvent.id=MicropostsController#correct_user
findingEvent.raises_exception=false
participatingEvent.request.event_type=http_server_request
participatingEvent.request.route=DELETE /microposts/{id}
participatingEvent.request.status_code=302
stack[1].event_type=function
stack[1].id=ActiveSupport::Callbacks::CallbackSequence#invoke_before
stack[1].raises_exception=false
stack[2].event_type=function
stack[2].id=ActionController::Instrumentation#process_action
stack[2].raises_exception=false
stack[3].event_type=http_server_request
stack[3].route=DELETE /microposts/{id}
stack[3].status_code=302`);
  expect(finding.ruleId).toEqual('authz-before-authn');
  expect(finding.event.id).toEqual(16);
  expect(finding.message).toEqual(
    `MicropostsController#correct_user provides authorization, but the request is not authenticated`
  );
});
