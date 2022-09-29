const { strict: Assert } = require('assert');
const Semver = require('semver');
const { validate, AppmapError } = require('../lib/index.js');

for (const version of ['1.2.0', '1.3.0', '1.4.0', '1.5.0', '1.5.1', '1.6.0', '1.7.0', '1.8.0']) {
  const data = {
    version,
    metadata: {
      client: {
        name: 'appmap-validate',
        url: 'https://github.com/getappmap/appmap-validate',
      },
      recorder: {
        name: 'appmap-validate',
      },
    },
    classMap: [
      {
        type: 'package',
        name: 'directory',
        children: [
          {
            type: 'package',
            name: 'filename.js',
            children: [
              {
                type: 'class',
                name: 'C',
                children: [
                  {
                    type: 'function',
                    name: 'f',
                    location: 'directory/filename.js:123',
                    static: true,
                    source: 'function f () {}',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    events: [
      // function //
      {
        event: 'call',
        id: 1,
        thread_id: 456,
        path: 'directory/filename.js',
        lineno: 123,
        static: true,
        method_id: 'f',
        defined_class: 'C',
        receiver: {
          name: 'this',
          object_id: 789,
          class: 'string',
          value: 'foo',
        },
        parameters: [
          {
            name: 'x',
            object_id: 789,
            class: 'string',
            value: 'foo',
          },
        ],
      },
      {
        event: 'return',
        id: 2,
        thread_id: 456,
        parent_id: 1,
        return_value: null,
      },
      // sql //
      {
        event: 'call',
        id: 3,
        thread_id: 456,
        sql_query: {
          database_type: 'sqlite3',
          sql: 'SELECT 123 as SOLUTION;',
        },
      },
      {
        event: 'return',
        id: 4,
        thread_id: 456,
        parent_id: 3,
      },
      // http-server //
      {
        event: 'call',
        id: 5,
        thread_id: 456,
        http_server_request: {
          request_method: 'GET',
          path_info: '/foo',
        },
        message: [],
      },
      {
        event: 'return',
        id: 6,
        thread_id: 456,
        parent_id: 5,
        http_server_response: {
          status_code: 200,
        },
      },
      // http-client //
      ...(Semver.satisfies(version, '>= 1.5.0')
        ? [
            {
              event: 'call',
              id: 7,
              thread_id: 456,
              http_client_request: {
                request_method: 'GET',
                url: '/foo',
              },
              message: [],
            },
            {
              event: 'return',
              id: 8,
              thread_id: 456,
              parent_id: 7,
              http_client_response: {
                status_code: 200,
              },
            },
          ]
        : []),
    ],
    ...(Semver.satisfies(version, '>= 1.8.0')
      ? {
          eventUpdates: {
            2: {
              event: 'return',
              id: 2,
              thread_id: 456,
              parent_id: 1,
              return_value: null,
            },
          },
        }
      : {}),
  };
  Assert.equal(validate(data), version);
  data.events.push(123);
  Assert.throws(() => validate(data), AppmapError);
  data.events.pop();
  delete data.metadata;
  Assert.throws(() => validate(data), AppmapError);
  Assert.throws(() => validate(data, { 'schema-depth': 2, 'instanceof-depth': 2 }), AppmapError);
}
