import codeObjectId from './codeObjectId';
import { CodeObjectType } from './codeObjectType';
import { addHiddenProperty, getSqlLabelFromString, transformToJSON } from './util';

export default class CodeObject {
  constructor(data, parent) {
    this.data = { ...data };

    // Include all raw data by default, and selectively remove some fields
    // that aren't appropriate to all types. This way, any mistakes in JSON stringification
    // will be extra data rather than missing data.
    this.dataKeys = Object.keys(data).filter(
      (item) => !['dynamic', 'static', 'location', 'database_type'].includes(item)
    );
    this.dataKeys.push('children');
    if (data.type === CodeObjectType.FUNCTION) {
      this.dataKeys.push('static');
      this.dataKeys.push('location');
    }
    if (data.type === CodeObjectType.QUERY) {
      this.dataKeys.push('database_type');
    }

    if (!(this.data.labels instanceof Set)) {
      this.data.labels = new Set(this.data.labels);
    }

    this.children = [];
    if (parent) {
      parent.children.push(this);
    }

    addHiddenProperty(this, 'parent', { value: parent });
    addHiddenProperty(this, 'events', { writable: false, value: [] });
  }

  get id() {
    return this.buildId().join('');
  }

  get name() {
    return this.data.name;
  }

  get type() {
    return this.data.type;
  }

  get static() {
    return this.data.static;
  }

  get location() {
    return this.data.location;
  }

  get labels() {
    return this.data.labels;
  }

  get events() {
    return this.$hidden.events;
  }

  get parent() {
    return this.$hidden.parent;
  }

  set parent(val) {
    this.$hidden.parent = val;
  }

  // Gets the source locations for this code object. For a package, no source locations are returned
  // (there would be too many to be useful). For a class, the paths to all files which add methods to the class are
  // returned. For a function, the path and line number is returned.
  get locations() {
    switch (this.type) {
      case CodeObjectType.CLASS:
        return Array.from(this.classLocations()).sort();
      case CodeObjectType.FUNCTION:
        return [this.location];
      default:
        return [];
    }
  }

  get packageOf() {
    return [this, ...this.ancestors()]
      .filter((obj) => obj.type === CodeObjectType.PACKAGE)
      .map((obj) => obj.name)
      .reverse()
      .join('/');
  }

  get classOf() {
    return [this, ...this.ancestors()]
      .filter((obj) => obj.type === CodeObjectType.CLASS)
      .map((obj) => obj.name)
      .reverse()
      .join('::');
  }

  get classObject() {
    return [this, ...this.ancestors()].find((obj) => obj.type === CodeObjectType.CLASS);
  }

  get packageObject() {
    return [this, ...this.ancestors()].find((obj) => obj.type === CodeObjectType.PACKAGE);
  }

  get functions() {
    if (this.type === CodeObjectType.CLASS) {
      // getting the functions of a class should not return functions of nested classes
      return this.children.filter((obj) => obj.type === CodeObjectType.FUNCTION);
    }

    return this.descendants().filter((obj) => obj.type === CodeObjectType.FUNCTION);
  }

  get classes() {
    return [this, ...this.descendants()].filter(
      (obj) => obj.type === CodeObjectType.CLASS && obj.functions.length
    );
  }

  // Enumerate this code object and all its descendants, calling a function for each one. The
  // traversal is depth-first.
  visit(fn, stack = []) {
    stack.push(this);
    fn(this, stack);
    this.children.forEach((child) => child.visit(fn, stack));
    stack.pop();
  }

  // Enumerate this code object and all its ancestors, calling a function for each one.
  visitAncestors(fn) {
    let ancestor = this;
    while (ancestor) {
      fn(ancestor);
      ancestor = ancestor.parent;
    }
  }

  /**
   * Finds the most specific descendants of a code object that have the same type.
   * The traversal stops when encountering a child of any other type.
   * This method is useful for retrieving children without worrying about types or deeply nested objects.
   *
   * For example, the 'leafs' of the package `com` may be:
   * - com.myorg.myapp
   * - com.myorg.myapp.api
   *
   * Whereas its children would only contain "myorg", and its descendants would include functions
   * and classes from any other nested package.
   *
   */
  leafs() {
    const { type } = this;
    const queue = [this];
    const leafArray = [];

    while (queue.length) {
      const obj = queue.pop();
      const childrenOfType = obj.children.filter((child) => child.type === type);

      // If this object has children of another type, consider it the most specific of the type.
      // For example, a package containing a class.
      if (childrenOfType.length) {
        queue.push(...childrenOfType);
      }

      // If, however, this object has a variety of child types, it's both a leaf and a parent
      if (
        (!obj.children.length && obj.type === type) ||
        childrenOfType.length !== obj.children.length
      ) {
        leafArray.push(obj);
      }
    }

    return leafArray;
  }

  /**
   * Returns leafs of all children. Similar to the `classes` accessor, but returns children of any
   * type.
   *
   * @see leafs
   */
  childLeafs() {
    return this.children.map((child) => child.leafs()).flat();
  }

  buildId(tokens = []) {
    return codeObjectId(this, tokens);
  }

  classLocations(paths = new Set()) {
    this.children.forEach((child) => child.classLocations(paths));

    if (this.type === CodeObjectType.FUNCTION && this.location) {
      const tokens = this.location.split(':', 2);
      paths.add(tokens[0]);
    }
    return paths;
  }

  toJSON() {
    return transformToJSON(this.dataKeys, this);
  }

  static constructDataChainFromEvent(event) {
    let elements;
    if (event.httpServerRequest) {
      elements = [
        {
          type: CodeObjectType.HTTP,
          name: 'HTTP server requests',
        },
        {
          type: CodeObjectType.ROUTE,
          name: event.route,
        },
      ];
    } else if (event.httpClientRequest) {
      let serviceName;

      try {
        const url = new URL(event.httpClientRequest.url);
        serviceName = url.host;
      } catch {
        serviceName = 'External service';
      }

      elements = [
        {
          type: CodeObjectType.EXTERNAL_SERVICE,
          name: serviceName,
        },
        {
          type: CodeObjectType.EXTERNAL_ROUTE,
          name: event.route,
        },
      ];
    } else if (event.sqlQuery) {
      elements = [
        {
          type: CodeObjectType.DATABASE,
          name: 'Database',
        },
        {
          type: CodeObjectType.QUERY,
          name: event.sqlQuery,
          database_type: event.sql.database_type,
        },
      ];
    } else {
      elements = [
        {
          type: CodeObjectType.CLASS,
          name: event.definedClass,
        },
        {
          type: CodeObjectType.FUNCTION,
          name: event.methodId,
          static: event.isStatic,
          location: '',
        },
      ];
    }

    // Flag this object as having been created dynamically
    const queue = [...elements];
    while (queue.length) {
      const obj = queue.pop();
      obj.dynamic = true;
      if (obj.children) {
        obj.children.forEach((child) => queue.push(child));
      }
    }

    return elements;
  }

  get inboundConnections() {
    return this.allEvents.filter((e) => e.parent).map((e) => e.parent.codeObject);
  }

  get outboundConnections() {
    return this.allEvents
      .map((e) => e.children)
      .flat()
      .map((e) => e.codeObject);
  }

  get sqlQueries() {
    return this.allEvents
      .map((e) => e.children)
      .flat()
      .filter((e) => e.sql)
      .map((e) => e.codeObject);
  }

  get prettyName() {
    switch (this.type) {
      case CodeObjectType.FUNCTION:
        return `${this.classOf}${this.static ? '.' : '#'}${this.name}`;
      case CodeObjectType.CLASS:
        return this.classOf;
      case CodeObjectType.PACKAGE:
        return this.packageOf;
      case CodeObjectType.QUERY:
        return getSqlLabelFromString(this.name);
      default:
        return this.name;
    }
  }

  get fqid() {
    return `${this.type}:${this.id}`;
  }

  // The zone of deprecation.
  // ------------------------

  // This function is deprecated, because it allocates all events of all descendants into a new
  // array for each invocation.
  // Use `CodeObject.visit()` and `CodeObject.events` instead. A functional style is both more
  // idiomatic and more efficient.
  get allEvents() {
    return [this, ...this.descendants()].map((obj) => obj.events).flat();
  }

  // This function is deprecated, because it allocates all descendants into a new array for each invocation.
  // Use `CodeObject.visit()` instead. A functional style is both more idiomatic and more efficient.
  descendants() {
    const queue = [...this.children];
    const children = [];

    while (queue.length) {
      const child = queue.pop();
      children.push(child);
      queue.push(...child.children);
    }

    return children;
  }

  // This function is deprecated, because it allocates all descendants into a new array for each invocation.
  // Use `CodeObject.visitAncestors()` instead. A functional style is both more idiomatic and more efficient.
  ancestors() {
    let currentObject = this.parent;
    const parents = [];

    while (currentObject) {
      parents.push(currentObject);
      currentObject = currentObject.parent;
    }

    return parents;
  }
}
