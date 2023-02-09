import { Event, ParameterObject } from '@appland/models';
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import Response from './response';
import { headerValue, RPCRequest } from './rpcRequest';
import ObjectSchema from './objectSchema';
import { messageToOpenAPISchema, parseScheme } from './util';

const bodyParamMethods = new Set(['delete', 'put', 'post', 'patch']);

function openapiIn(rpcRequest: RPCRequest, name: string) {
  const pathInfo = rpcRequest.requestPath;
  // Trim format info from Rails paths, e.g. /foo/bar(.:format)
  const tokens = pathInfo.split('/').map((token) => token.split('(')[0]);
  // Recognize Rails-style normalized paths /org/:org_id and OpenAPI-style paths /org/{org_id}
  if (tokens.includes(`:${name}`) || tokens.includes(`{${name}}`)) {
    return 'path';
  }
  return 'query';
}

export default class Method {
  rpcRequests: RPCRequest[] = [];
  responses: Record<string, Response> = {};

  get summaries(): string[] {
    return this.rpcRequests
      .map((request) => headerValue(request.responseHeaders, 'x-openapi-summary'))
      .filter(Boolean) as string[];
  }

  openapi(): OpenAPIV3.OperationObject {
    const responseByStatus = Object.keys(this.responses)
      .sort()
      .reduce((memo, status: string) => {
        // eslint-disable-next-line no-param-reassign
        memo[status] = this.responses[status].openapi();
        return memo;
      }, {} as Record<string, OpenAPIV3.ResponseObject>);

    const schemata: Record<string, ObjectSchema> = {};
    const parameters: OpenAPIV3_1.ParameterObject[] = [];
    let securitySchemeId: string | undefined;

    const uniqueNames = new Set(['controller', 'action', '_method']);
    this.rpcRequests.forEach((rpcRequest) => {
      const messages: readonly ParameterObject[] = rpcRequest.parameters;

      if (!securitySchemeId) {
        const authorization = rpcRequest.requestHeaders['Authorization'];
        if (authorization) {
          const scheme = parseScheme(authorization);
          securitySchemeId = scheme.schemeId;
        }
      }

      let schema: ObjectSchema | undefined;
      if (rpcRequest.requestContentType) {
        const mimeType = rpcRequest.requestContentType.split(';')[0];
        if (!schemata[mimeType]) {
          schemata[mimeType] = new ObjectSchema();
        }
        schema = schemata[mimeType];
      }

      messages.forEach((message: ParameterObject) => {
        if (!message.name) {
          return;
        }
        if (uniqueNames.has(message.name)) {
          return;
        }
        uniqueNames.add(message.name);
        const inLocation = openapiIn(rpcRequest, message.name);
        if (
          inLocation !== 'path' &&
          rpcRequest.requestMethod &&
          bodyParamMethods.has(rpcRequest.requestMethod)
        ) {
          if (schema) {
            schema.addExample(message);
          }
        } else {
          const schema = messageToOpenAPISchema(message);
          if (!schema) return;
          const parameter = {
            name: message.name,
            in: inLocation,
            schema,
          } as OpenAPIV3.ParameterObject;
          if (parameter.in === 'path') {
            parameter.required = true;
          }
          parameters.push(parameter);
        }
      });
    });

    const response = {
      responses: responseByStatus,
    } as OpenAPIV3.OperationObject;
    if (securitySchemeId) {
      const securityObj: OpenAPIV3.SecurityRequirementObject = {};
      securityObj[securitySchemeId] = [];
      response.security = [securityObj];
    }
    const mediaTypes = Object.keys(schemata)
      .sort()
      .map((contentType) => ({
        contentType,
        schema: schemata[contentType].schema(),
      }))
      .filter((entry) => entry.schema);
    if (mediaTypes.length > 0) {
      const content: Record<string, OpenAPIV3.MediaTypeObject> = mediaTypes.reduce(
        (memo, entry) => {
          memo[entry.contentType] = { schema: entry.schema };
          return memo;
        },
        {} as Record<string, OpenAPIV3.MediaTypeObject>
      );
      response.requestBody = { content };
    }
    if (parameters.length > 0) {
      response.parameters = parameters.sort((a, b) => a.name.localeCompare(b.name));
    }

    const summaryFrequency = new Map<string, number>();
    this.summaries.forEach((summary) =>
      summaryFrequency.set(summary, (summaryFrequency.get(summary) || 0) + 1)
    );

    if (summaryFrequency.size > 0) {
      response.summary = [...summaryFrequency.keys()].sort(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (a, b) => summaryFrequency.get(b)! - summaryFrequency.get(a)!
      )[0];
    }

    return response;
  }

  addRpcRequest(request: RPCRequest): void {
    const { status } = request;
    if (!this.responses[status]) {
      this.responses[status] = new Response(status);
    }
    this.rpcRequests.push(request);
    const responseObj = this.responses[status];
    responseObj.addRpcRequest(request);
  }
}
