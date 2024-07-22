import { warn } from 'node:console';

import yargs from 'yargs';

import { loadConfiguration } from '@appland/client';

import { verbose } from '../../utils';
import { search } from '../../rpc/search/search';
import appmapFilter from '../../rpc/appmap/filter';
import { RpcHandler } from '../../rpc/rpc';
import metadata from '../../rpc/appmap/metadata';
import sequenceDiagram from '../../rpc/appmap/sequenceDiagram';
import { explainHandler, explainStatusHandler } from '../../rpc/explain/explain';
import { buildNavieProvider, commonNavieArgsBuilder as navieBuilder } from '../navie';
import RPCServer from './rpcServer';
import appmapData from '../../rpc/appmap/data';
import { appmapStatsV1, appmapStatsV2 } from '../../rpc/appmap/stats';
import { configureRpcDirectories } from '../../lib/handleWorkingDirectory';
import {
  getConfigurationV1,
  getConfigurationV2,
  setConfigurationV1,
  setConfigurationV2,
} from '../../rpc/configuration';
import detectCodeEditor from '../../lib/detectCodeEditor';
import { update } from '../../rpc/file/update';

export const command = 'rpc';
export const describe = 'Run AppMap JSON-RPC server';

export const builder = <T>(args: yargs.Argv<T>) => {
  return navieBuilder(args)
    .option('port', {
      describe:
        'port to listen on for JSON-RPC requests. Use port 0 to let the OS choose a port. The port number will be printed to stdout on startup.',
      type: 'number',
      alias: 'p',
      default: 0,
    })
    .strict();
};

type GetArgv<T> = T extends yargs.Argv<infer A> ? A : never;
type HandlerArguments = yargs.ArgumentsCamelCase<
  GetArgv<ReturnType<typeof builder>> & { verbose?: boolean }
>;

export const handler = async (argv: HandlerArguments) => {
  verbose(argv.verbose);

  const navie = buildNavieProvider(argv);
  let codeEditor: string | undefined = argv.codeEditor;
  if (!codeEditor) {
    codeEditor = detectCodeEditor();
    if (codeEditor) warn(`Detected code editor: ${codeEditor}`);
  }

  loadConfiguration(false);
  await configureRpcDirectories(argv.directory);

  // WIP: Help the @apply command to resolve paths
  if (argv.directory.length === 1) process.chdir(argv.directory[0]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcMethods: RpcHandler<any, any>[] = [
    search(),
    appmapStatsV1(),
    appmapStatsV2(),
    appmapFilter(),
    appmapData(),
    metadata(),
    sequenceDiagram(),
    explainHandler(navie, codeEditor),
    explainStatusHandler(),
    update(navie),
    setConfigurationV1(),
    getConfigurationV1(),
    setConfigurationV2(),
    getConfigurationV2(),
  ];
  const rpcServer = new RPCServer(argv.port, rpcMethods);
  rpcServer.start();
};
