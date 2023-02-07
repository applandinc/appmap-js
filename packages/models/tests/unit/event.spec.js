import buildAppMap from '../../src/appMapBuilder';
import Event from '../../src/event';
import scenario from './fixtures/large_scenario.json';
import httpScenario from './fixtures/many_requests_scenario.json';

const verifyJSON = (obj, expected) => {
  const json = JSON.stringify(obj, null, 2);
  expect(JSON.parse(json)).toEqual(expected);
};

describe('Event', () => {
  describe('with large scenario', () => {
    const appMap = buildAppMap(scenario).normalize().build();
    const getTasksEvent = appMap.events.find((e) => e.isCall() && e.methodId === 'getTasks');

    it('toJSON', () => {
      verifyJSON(getTasksEvent, {
        defined_class: 'org.apache.zookeeper.book.recovery.RecoveredAssignments',
        event: 'call',
        id: 567,
        lineno: 97,
        method_id: 'getTasks',
        path: 'src/main/java/org/apache/zookeeper/book/recovery/RecoveredAssignments.java',
        receiver: {
          class: 'org.apache.zookeeper.book.recovery.RecoveredAssignments',
          object_id: 1060809318,
          value: 'org.apache.zookeeper.book.recovery.RecoveredAssignments@3f3aaa66',
        },
        static: false,
        thread_id: 115,
      });
    });

    it('stableProperties', () => {
      verifyJSON(getTasksEvent.stableProperties, {
        event_type: 'function',
        raises_exception: false,
        id: 'org/apache/zookeeper/book/recovery/RecoveredAssignments#getTasks',
      });
    });

    test('callStack', () => {
      const callStack = getTasksEvent.callStack();

      expect(callStack.length).toEqual(3);
      expect(callStack[0]).toBeInstanceOf(Event);
      expect(callStack[0].methodId).toEqual('takeLeadership');
      expect(callStack[1].methodId).toEqual('recover');
      expect(callStack[2].methodId).toEqual('getTasks');
    });

    test('ancestors', () => {
      const recoverEvent = appMap.events.find((e) => e.isCall() && e.methodId === 'recover');
      const ancestors = recoverEvent.ancestors();

      expect(ancestors.length).toEqual(1);
      expect(ancestors[0]).toBeInstanceOf(Event);
      expect(ancestors[0].methodId).toEqual('takeLeadership');
    });

    test('descendants', () => {
      const recoverEvent = appMap.events.find((e) => e.isCall() && e.methodId === 'recover');
      const descendants = recoverEvent.descendants();

      expect(descendants.length).toEqual(1);
      expect(descendants[0]).toBeInstanceOf(Event);
      expect(descendants[0].methodId).toEqual('getTasks');
    });
  });

  describe('with web service scenario', () => {
    const appMap = buildAppMap(httpScenario).normalize().build();

    describe('SQL query', () => {
      const query = 'SELECT COUNT(*) FROM "spree_stores"';
      const sqlEvent = appMap.events.find((e) => e.sql_query && e.sql_query.sql === query);
      it('sqlQuery', () => {
        expect(sqlEvent.sqlQuery).toEqual(query);
      });
      it('toJSON', () => {
        verifyJSON(sqlEvent, {
          event: 'call',
          id: 62,
          sql_query: {
            database_type: 'sqlite',
            normalized: true,
            normalized_sql: 'SELECT COUNT(*) FROM "spree_stores"',
            server_version: '3.22.0',
            sql: 'SELECT COUNT(*) FROM "spree_stores"',
          },
          thread_id: 47346401950060,
        });
      });
      describe('identityProperties', () => {
        it('actions and tables', () => {
          verifyJSON(sqlEvent.gatherIdentityProperties(), {
            event_type: 'sql',
            actions: ['select'],
            tables: ['spree_stores'],
          });
        });
      });
      describe('stableProperties', () => {
        it('sql_normalized', () => {
          verifyJSON(sqlEvent.gatherStableProperties(), {
            event_type: 'sql',
            sql_normalized:
              '{"type":"statement","variant":"list","statement":[{"type":"statement","variant":"select","result":[{"type":"function","name":{"type":"identifier","variant":"function","name":"count"},"args":{"type":"identifier","variant":"star","name":"*"}}],"from":{"type":"identifier","variant":"table","name":"spree_stores"}}]}',
          });
        });
        it('sql_normalized with query parameters', () => {
          const sql = {
            database_type: 'sqlite',
            sql: 'SELECT 1 FROM "spree_stores" WHERE id IN ( ?, ?, ?, 12 )',
          };
          const eventWithQueryParameters = new Event({
            ...sqlEvent,
            ...{ sql_query: sql },
          });
          eventWithQueryParameters.link(
            new Event({
              ...sqlEvent.returnEvent,
            })
          );
          verifyJSON(eventWithQueryParameters.stableProperties, {
            event_type: 'sql',
            // Verify that the query parameters and literal are normalized to one {"type":"variable"}
            sql_normalized:
              '{"type":"statement","variant":"list","statement":[{"type":"statement","variant":"select","result":[{"type":"variable"}],"from":{"type":"identifier","variant":"table","name":"spree_stores"},"where":[{"type":"expression","format":"binary","variant":"operation","operation":"in","right":{"type":"expression","variant":"list","expression":[{"type":"variable"}]},"left":{"type":"identifier","variant":"column","name":"id"}}]}]}',
          });
        });
      });

      describe('without returnValue', () => {
        const callOnlyEvent = new Event({ id: 1 });

        it('has no returnValue', () => expect(callOnlyEvent.returnValue).toBeUndefined());
        it('has no elapsedTime', () => expect(callOnlyEvent.elapsedTime).toBeUndefined());
        it('has no elapsedInstrumentationTime', () =>
          expect(callOnlyEvent.elapsedInstrumentationTime).toBeUndefined());
        it('has no exceptions', () => expect(callOnlyEvent.exceptions).toEqual([]));
        it('has no httpServerResponse', () =>
          expect(callOnlyEvent.httpServerResponse).toBeUndefined());
        it('has no httpClientResponse', () =>
          expect(callOnlyEvent.httpClientResponse).toBeUndefined());
        it('has no parentId', () => expect(callOnlyEvent.parentId).toBeUndefined());
      });
    });

    describe('HTTP server request', () => {
      const event = appMap.events.find(
        (e) => e.http_server_request && e.http_server_request.path_info === '/admin'
      );

      it('provides access to the response status', () => {
        expect(event.httpServerResponse.status).toEqual(302);
        expect(event.httpServerResponse.status_code).toEqual(302);
      });
      it('route', () => {
        expect(event.route).toEqual('GET /admin');
      });
      it('toJSON', () => {
        verifyJSON(event, {
          event: 'call',
          http_server_request: {
            normalized_path_info: '/admin',
            path_info: '/admin',
            request_method: 'GET',
          },
          id: 1,
          message: [
            {
              class: 'String',
              name: 'controller',
              object_id: 70021264966880,
              value: 'spree/admin/root',
            },
            {
              class: 'String',
              name: 'action',
              object_id: 70021264966940,
              value: 'index',
            },
          ],
          thread_id: 47346401950060,
        });
      });
      describe('identityProperties', () => {
        it('sql', () => {
          verifyJSON(event.gatherIdentityProperties(), {
            event_type: 'http_server_request',
            route: 'GET /admin',
          });
        });
      });
      describe('stable properties', () => {
        it('route and status code', () => {
          verifyJSON(event.gatherStableProperties(), {
            event_type: 'http_server_request',
            route: 'GET /admin',
            status_code: 302,
          });
        });
        it('with content type', () => {
          const headers = {
            'Content-Type': 'text/plain',
          };
          const eventWithContentType = new Event({ ...event });
          const returnEventData = { ...event.returnEvent };
          returnEventData.http_server_response.headers = headers;
          eventWithContentType.link(new Event(returnEventData));
          verifyJSON(eventWithContentType.stableProperties, {
            event_type: 'http_server_request',
            route: 'GET /admin',
            status_code: 302,
          });
        });
      });
    });

    describe('function', () => {
      const event = appMap.events.find((e) => e.method_id);

      describe('identityProperties', () => {
        it('id', () => {
          verifyJSON(event.gatherIdentityProperties(), {
            event_type: 'function',
            id: 'app/controllers/Spree::Admin::RootController#index',
          });
        });
      });
      describe('stable properties', () => {
        it('id', () => {
          verifyJSON(event.gatherStableProperties(), {
            event_type: 'function',
            id: 'app/controllers/Spree::Admin::RootController#index',
            raises_exception: false,
          });
        });
      });
    });

    it('all events have CodeObjects', () => {
      const callEvents = appMap.events.filter((e) => e.isCall());
      const events = callEvents.filter((e) => e.codeObject.events.includes(e));

      expect(events.length).toEqual(callEvents.length);
    });
  });
});
