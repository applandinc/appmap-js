const Ajv = require("ajv");
const { asTree } = require("treeify");
const { structureAJVErrorArray, summarizeAJVErrorTree } = require("ajv-error-tree");
const { AppmapError, InputError, assert } = require("./assert.js");
const { schema: schema_1_2_0 } = require("../schema/1-2-0.js");
const { schema: schema_1_3_0 } = require("../schema/1-3-0.js");
const { schema: schema_1_4_0 } = require("../schema/1-4-0.js");
const { schema: schema_1_5_0 } = require("../schema/1-5-0.js");
const { schema: schema_1_5_1 } = require("../schema/1-5-1.js");
const { schema: schema_1_6_0 } = require("../schema/1-6-0.js");

const ajv = new Ajv({
  // jsPropertySyntax: true
  verbose: true,
});

const versions = new Map([
  ["1.2.0", ajv.compile(schema_1_2_0)],
  ["1.3.0", ajv.compile(schema_1_3_0)],
  ["1.4.0", ajv.compile(schema_1_4_0)],
  ["1.5.0", ajv.compile(schema_1_5_0)],
  ["1.5.1", ajv.compile(schema_1_5_1)],
  ["1.6.0", ajv.compile(schema_1_6_0)],
]);

const keys = Array.from(versions.keys());

const makeDesignator = JSON.stringify;

const getCallTag = (event) => {
  assert(event.event === "call", Error, "expected a call event");
  if (Reflect.getOwnPropertyDescriptor(event, "method_id") !== undefined) {
    return "function";
  }
  if (Reflect.getOwnPropertyDescriptor(event, "http_client_request") !== undefined) {
    return "http-client";
  }
  if (Reflect.getOwnPropertyDescriptor(event, "http_server_request") !== undefined) {
    return "http-server";
  }
  if (Reflect.getOwnPropertyDescriptor(event, "sql_query") !== undefined) {
    return "sql";
  }
  /* c8 ignore start */
  assert(false, Error, "invalid event");
  /* c8 ignore stop */
};

const getReturnTag = (event) => {
  assert(event.event === "return", Error, "expected a return event");
  if (
    Reflect.getOwnPropertyDescriptor(event, "return_value") !== undefined ||
    Reflect.getOwnPropertyDescriptor(event, "exceptions") !== undefined
  ) {
    return "function";
  }
  if (Reflect.getOwnPropertyDescriptor(event, "http_client_response") !== undefined) {
    return "http-client";
  }
  if (Reflect.getOwnPropertyDescriptor(event, "http_server_response") !== undefined) {
    return "http-server";
  }
  return "sql|function";
};

exports.AppmapError = AppmapError;

exports.InputError = InputError;

exports.validate = (data, options) => {
  // Normalize options //
  options = {
    "schema-depth": 0,
    "instance-depth": 0,
    version: null,
    ...options,
  };
  if (options.version === null) {
    assert(
      typeof data === "object" &&
        data !== null &&
        Reflect.getOwnPropertyDescriptor(data, "version") !== undefined,
      AppmapError,
      "could not extract version from appmap"
    );
    options.version = data.version;
  }
  if (/^[0-9]+\.[0-9]+$/.test(options.version)) {
    options.version = `${options.version}.0`;
  }
  assert(
    versions.has(options.version),
    InputError,
    "unsupported appmap version %o; expected one of %o",
    options.version,
    keys
  );
  // Validate against json schema //
  const validate = versions.get(options.version);
  if (!validate(data)) {
    const tree1 = structureAJVErrorArray(validate.errors);
    const tree2 = summarizeAJVErrorTree(tree1, options);
    let message;
    if (options["schema-depth"] === 0 && options["instance-depth"] === 0) {
      message = typeof tree2 === "string" ? tree2 : asTree(tree2, true);
    } else {
      message = JSON.stringify(tree2, null, 2);
    }
    throw new AppmapError(message, { list: validate.errors, tree: tree1 });
  }
  const events = data.events;
  // Verify the unicity of code object //
  const designators = new Set();
  const collectDesignator = (entity, parent, path1) => {
    if (entity.type === "function") {
      assert(
        parent !== null,
        Error,
        "this appmap should not have passed ajv (function code objects should not appear at the top-level)"
      );
      if (
        Reflect.getOwnPropertyDescriptor(entity, "location") !== undefined &&
        entity.location !== null
      ) {
        let path2 = entity.location;
        let lineno = null;
        if (path2 !== null && /:[0-9]+$/u.test(path2)) {
          [, path2, lineno] = /^([\s\S]*):([0-9]+)$/.exec(entity.location);
        }
        // assert(
        //   path1.toLowerCase().startsWith(path2.toLowerCase()),
        //   AppmapError,
        //   "path should be a prefix of %o for function code object %o",
        //   path1,
        //   entity
        // );
        const designator = makeDesignator([
          parent.name,
          path2,
          parseInt(lineno),
          entity.static,
          entity.name,
        ]);
        assert(
          !designators.has(designator),
          AppmapError,
          "detected a function code object clash in the classMap: %o",
          entity
        );
        designators.add(designator);
      }
    } else {
      path1 = `${path1}${entity.name}/`;
      for (let child of entity.children) {
        collectDesignator(child, entity, path1);
      }
    }
  };
  for (let entity of data.classMap) {
    collectDesignator(entity, null, "");
  }
  // Verify the per thread fifo ordering //
  {
    const threads = new Map();
    const ids = new Map();
    let max = 0;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      assert(
        event.id > max,
        AppmapError,
        "non-monotonous event id between #%i and #%i",
        event.id,
        max
      );
      max = event.id;
      ids.set(event.id, index);
      let thread = threads.get(event.thread_id);
      if (thread === undefined) {
        thread = [];
        threads.set(event.thread_id, thread);
      }
      if (event.event === "call") {
        // console.log(new Array(thread.length).join("."), event.id);
        thread.push(event);
      } else {
        const parent = thread.pop();
        // console.log(new Array(thread.length).join("."), event.id, event.parent_id);
        assert(
          parent.id === event.parent_id,
          AppmapError,
          "expected parent id of return event #%i to be %i but got %i",
          event.id,
          parent.id,
          event.parent_id
        );
        const tag1 = getCallTag(parent);
        const tag2 = getReturnTag(event);
        assert(
          tag2.includes(tag1),
          AppmapError,
          "incompatible event type between #%i and #%i, expected a %s but got a %s",
          event.id,
          event.parent_id,
          tag1,
          tag2
        );
      }
    }
  }
  // Return //
  return options.version;
};
