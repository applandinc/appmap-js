import { NavieRpc } from '@appland/rpc';
import { RpcHandler } from '../../../rpc';
import ModelRegistry from '../registry';

export function navieModelsListV1(): RpcHandler<
  NavieRpc.V1.Models.List.Params,
  NavieRpc.V1.Models.List.Response
> {
  return {
    name: NavieRpc.V1.Models.List.Method,
    handler: () => ModelRegistry.instance.list(),
  };
}
