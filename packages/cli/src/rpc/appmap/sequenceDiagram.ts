import { AppMapRpc } from '@appland/rpc';
import { RpcHandler } from '../rpc';
import {
  FormatType,
  SequenceDiagramOptions,
  Specification,
  buildDiagram,
  format,
} from '@appland/sequence-diagram';
import { FilterState, buildAppMap } from '@appland/models';
import { readFile } from 'fs/promises';
import { appmapFile } from './appmapFile';
import interpretFilter from './interpretFilter';

export type HandlerOptions = {
  filter?: string | Record<string, string | boolean | string[]> | FilterState;
  diagramOptions?: Record<string, any>;
  format?: string;
  formatOptions?: Record<string, string | boolean>;
};

export async function handler(
  appmapId: string,
  options: HandlerOptions
): Promise<AppMapRpc.SequenceDiagramResponse> {
  let {
    filter: filterArg,
    diagramOptions: diagramOptionsArg,
    format: formatArg,
    formatOptions: formatOptionsArg,
  } = options;

  const diagramFormat = (formatArg || FormatType.JSON) as FormatType;
  const diagramFormatOptions: Record<string, boolean | string> = formatOptionsArg || {};

  const filter = interpretFilter(filterArg);

  const appmapStr = await readFile(appmapFile(appmapId), 'utf8');
  let appmap = buildAppMap().source(appmapStr).build();
  if (filter) {
    appmap = filter.filter(appmap, []);
  }

  const sequenceDiagramOptions: SequenceDiagramOptions = diagramOptionsArg
    ? (diagramOptionsArg as SequenceDiagramOptions)
    : { loops: true };

  const specification = Specification.build(appmap, sequenceDiagramOptions);
  const diagram = buildDiagram(appmapFile(appmapId), appmap, specification);
  let result = format(diagramFormat, diagram, appmapFile(appmapId), diagramFormatOptions).diagram;
  if (diagramFormat === FormatType.JSON) result = JSON.parse(result);
  return result;
}

export default function sequenceDiagram(): RpcHandler<
  AppMapRpc.SequenceDiagramOptions,
  AppMapRpc.SequenceDiagramResponse
> {
  return {
    name: AppMapRpc.SequenceDiagramFunctionName,
    handler: (args) => handler(args.appmap, args),
  };
}
