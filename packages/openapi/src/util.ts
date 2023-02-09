import { OpenAPIV3 } from 'openapi-types';
import { parse, SchemaExample } from './appmap';

const unrecognizedTypes = new Set();

interface Scheme {
  schemeId: string;
  scheme: OpenAPIV3.SecuritySchemeObject;
}

function parseScheme(authorization: string): Scheme {
  const tokens = authorization.split(/\s/);
  if (tokens.length === 1) {
    return {
      schemeId: 'api_key',
      scheme: {
        type: 'apiKey',
        name: 'authorization',
        in: 'header',
      } as OpenAPIV3.ApiKeySecurityScheme,
    };
  }

  const schemeId = tokens[0].toLowerCase();
  return {
    schemeId,
    scheme: {
      type: 'http',
      scheme: schemeId,
    } as OpenAPIV3.HttpSecurityScheme,
  };
}

type OptSchemaObjectType = OpenAPIV3.SchemaObject['type'];
type OptObjectTypeOrUnknown = OptSchemaObjectType | 'unknown';

function classNameToOpenAPIType(className?: string): OptSchemaObjectType {
  if (!className || className === '') return;
  if (unrecognizedTypes.has(className)) return 'object';

  const mapRubyType = (t: string): OptObjectTypeOrUnknown => {
    switch (t) {
      case 'array':
      case 'sequel::postgres::pgarray':
        return 'array';
      case 'hash':
      case 'sequel::postgres::jsonbhash':
      case 'activesupport::hashwithindifferentaccess':
        return 'object';
      case 'integer':
        return 'integer';
      case 'float':
      case 'numeric':
        return 'number';
      case 'trueclass':
      case 'falseclass':
        return 'boolean';
      case 'nilclass':
        return 'unknown';
      case 'string':
        return 'string';
    }
  };

  const mapPythonType = (t: string): OptObjectTypeOrUnknown => {
    if (!t.startsWith('builtins.')) {
      return;
    }

    switch (t.substring(9)) {
      case 'bool':
        return 'boolean';
      case 'dict':
        return 'object';
      case 'int':
        return 'integer';
      case 'list':
        return 'array';
      case 'str':
        return 'string';
      case 'nonetype':
        return 'unknown';
    }
  };

  const mapJavaType = (t: string): OptSchemaObjectType => {
    switch (t) {
      case 'java.lang.string':
        return 'string';
    }
  };

  const mapper = (t: string): OptObjectTypeOrUnknown =>
    mapRubyType(t) || mapPythonType(t) || mapJavaType(t);
  const mapped = mapper(className.toLowerCase());
  if (!mapped && !unrecognizedTypes.has(className)) {
    if (verbose()) {
      console.warn(
        `Warning: Don't know how to map "${className}" to an OpenAPI type. You'll need to update the generated file.`
      );
    }
    unrecognizedTypes.add(className);
    return 'object';
  }
  if (mapped === 'unknown') return;
  return mapped;
}

function messageToOpenAPISchema(example: SchemaExample): OpenAPIV3.SchemaObject | undefined {
  return parse(example);
}

function ensureString(value: Array<string> | string): string {
  if (Array.isArray(value)) {
    return value.join('');
  }
  return value.toString();
}

let isVerbose = false;
export function verbose(v?: boolean) {
  if (v !== undefined) {
    isVerbose = v;
  }
  return isVerbose;
}

export { classNameToOpenAPIType, ensureString, messageToOpenAPISchema, parseScheme };
