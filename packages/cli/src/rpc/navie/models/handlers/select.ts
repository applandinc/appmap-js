import { NavieRpc } from '@appland/rpc';
import { RpcHandler } from '../../../rpc';
import ModelRegistry from '../registry';

export function navieModelsSelectV1(): RpcHandler<
  NavieRpc.V1.Models.Select.Params,
  NavieRpc.V1.Models.Select.Response
> {
  return {
    name: NavieRpc.V1.Models.Select.Method,
    handler: (model) => ModelRegistry.instance.select(model),
  };
}
