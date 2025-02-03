import { NavieRpc } from '@appland/rpc';
import { RpcHandler } from '../../../rpc';
import ModelRegistry from '../registry';

export function navieModelsAddV1(): RpcHandler<
  NavieRpc.V1.Models.Add.Params,
  NavieRpc.V1.Models.Add.Response
> {
  return {
    name: NavieRpc.V1.Models.Add.Method,
    handler: (models) => {
      models.forEach((model) => ModelRegistry.instance.add(model));
    },
  };
}
