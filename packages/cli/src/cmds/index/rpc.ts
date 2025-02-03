import { warn } from 'node:console';

import yargs from 'yargs';

import { loadConfiguration } from '@appland/client';

import { verbose } from '../../utils';
import { search } from '../../rpc/search/search';
import appmapFilter from '../../rpc/appmap/filter';
import { RpcHandler } from '../../rpc/rpc';
import metadata from '../../rpc/appmap/metadata';
import sequenceDiagram from '../../rpc/appmap/sequenceDiagram';
import { explainHandler, explainStatusHandler, loadThreadHandler } from '../../rpc/explain/explain';
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
import { INavieProvider } from '../../rpc/explain/navie/inavie';
import { navieMetadataV1, navieMetadataV2 } from '../../rpc/navie/metadata';
import { navieSuggestHandlerV1 } from '../../rpc/navie/suggest';
import { initializeHistory } from '../../rpc/explain/navie/historyHelper';
import History from '../../rpc/explain/navie/history';
import { join } from 'path';
import { homedir } from 'os';
import { navieWelcomeV2 } from '../../rpc/navie/welcome';
import { navieRegisterV1 } from '../../rpc/navie/register';
import ModelRegistry from '../../rpc/navie/models/registry';
import { navieModelsAddV1 } from '../../rpc/navie/models/handlers/add';
import { navieModelsListV1 } from '../../rpc/navie/models/handlers/list';
import { navieModelsSelectV1 } from '../../rpc/navie/models/handlers/select';

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

export function rpcMethods(navie: INavieProvider, codeEditor?: string): RpcHandler<any, any>[] {
  return [
    search(),
    appmapStatsV1(),
    appmapStatsV2(),
    appmapFilter(),
    appmapData(),
    metadata(),
    sequenceDiagram(),
    explainHandler(navie, codeEditor),
    explainStatusHandler(),
    loadThreadHandler(),
    update(navie),
    setConfigurationV1(),
    getConfigurationV1(),
    setConfigurationV2(),
    getConfigurationV2(),
    navieMetadataV1(),
    navieMetadataV2(),
    navieSuggestHandlerV1(navie),
    navieWelcomeV2(navie),
    navieRegisterV1(codeEditor),
    navieModelsAddV1(),
    navieModelsListV1(),
    navieModelsSelectV1(),
  ];
}

export const handler = async (argv: HandlerArguments) => {
  verbose(argv.verbose);

  ModelRegistry.instance.refresh().catch((e) => {
    console.error(`failed to intialize model registry: ${String(e)}`);
  });

  const navie = buildNavieProvider(argv);
  let codeEditor: string | undefined = argv.codeEditor;
  if (!codeEditor) {
    codeEditor = detectCodeEditor();
    if (codeEditor) warn(`Detected code editor: ${codeEditor}`);
  }

  loadConfiguration(false);
  await configureRpcDirectories(argv.directory);

  {
    const history = initializeHistory();
    const oldHistoryDir = join(homedir(), '.appmap', 'navie', 'history');
    await History.migrate(oldHistoryDir, history);
  }

  const rpcServer = new RPCServer(argv.port, rpcMethods(navie, codeEditor));
  rpcServer.start();
};
