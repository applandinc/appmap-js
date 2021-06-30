const { buildTree, notNull } = require('../algorithms');

const BLACKLISTED_LABELS = new Set([
  'format.json.generate',
  'format.yaml.generate',
  'http.session.read',
]);

module.exports = class {
  constructor(appmap) {
    this.appmap = appmap;
  }

  // eslint-disable-next-line class-methods-use-this
  whitelistedLabels(labels) {
    return [...labels].filter((label) => !BLACKLISTED_LABELS.has(label));
  }

  execute() {
    const events = this.appmap.events
      .filter((event) => event.isCall())
      .map(this.transform.bind(this))
      .filter(notNull);

    return buildTree(events);
  }

  transform(event) {
    const buildEvent = () => {
      if (event.sql) {
        return this.sql(event);
      }
      if (event.httpServerRequest) {
        return this.httpServerRequest(event);
      }
      if (event.httpClientRequest) {
        return this.httpClientRequest(event);
      }

      return this.functionCall(event);
    };

    const result = buildEvent();
    if (!result) {
      return null;
    }

    result.id = event.id;
    if (event.parent) {
      result.parent_id = event.parent.id;
    }
    result.depth = event.depth;
    return result;
  }
};
