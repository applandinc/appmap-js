import { NavieRpc } from '@appland/rpc';
import { verbose } from '../../../utils';

interface AnthropicModelResponse {
  data: {
    type: 'model';
    id: string;
    display_name: string;
    created_at: string;
  }[];
  has_more: boolean;
  first_id: string;
  last_id: string;
}

function normalizeDate(date: string | number) {
  if (typeof date === 'number') {
    return new Date(date * 1000).toISOString();
  }
  return new Date(date).toISOString();
}

async function fetchAnthropicModels(apiKey: string): Promise<NavieRpc.V1.Models.Model[]> {
  const models: NavieRpc.V1.Models.Model[] = [];
  const params = new URLSearchParams({ limit: '100' });
  let nextId: string | undefined;

  for (;;) {
    if (nextId) {
      params.set('after_id', nextId);
    }

    try {
      const res = await fetch(`https://api.anthropic.com/v1/models?${params.toString()}`, {
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!res.ok) {
        throw new Error(`recieved unexpected response ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as AnthropicModelResponse;
      models.push(
        ...json.data.map((model) => ({
          id: model.id,
          name: model.display_name,
          provider: 'Anthropic',
          createdAt: normalizeDate(model.created_at),
        }))
      );

      if (!json.has_more) {
        break;
      }

      nextId = json.last_id;
    } catch (e) {
      console.error(`failed to fetch anthropic models: ${String(e)}`);
      break;
    }
  }

  return models;
}

interface OpenAiModelResponse {
  object: 'list';
  data: {
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
  }[];
}
async function fetchOpenAIModels(apiKey: string): Promise<NavieRpc.V1.Models.Model[]> {
  const models: NavieRpc.V1.Models.Model[] = [];
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`recieved unexpected response ${res.status} ${res.statusText}`);
    }

    const nonInternalModel = (model: OpenAiModelResponse['data'][number]) =>
      !['openai-internal', 'openai'].includes(model.owned_by);

    const isRelevantModel = (model: OpenAiModelResponse['data'][number]) =>
      model.owned_by !== 'system' ||
      !model.id.match(/preview|embedding|tts|moderation|dall-e|chatgpt|\d{3,}/g);

    const json = (await res.json()) as OpenAiModelResponse;
    models.push(
      ...json.data
        .filter((model) => nonInternalModel(model) && isRelevantModel(model))
        .map((model) => ({
          id: model.id,
          name: model.id,
          provider: 'OpenAI',
          createdAt: normalizeDate(model.created),
        }))
    );
  } catch (e) {
    console.error(`failed to fetch openai models: ${String(e)}`);
  }

  return models;
}

interface OllamaModelResponse {
  models: {
    name: string;
    modified_at: string;
  }[];
}

async function fetchOllamaModels(): Promise<NavieRpc.V1.Models.Model[]> {
  const models: NavieRpc.V1.Models.Model[] = [];
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      headers: {
        'content-type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`recieved unexpected response ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as OllamaModelResponse;
    models.push(
      ...json.models.map((model) => ({
        id: model.name,
        name: model.name,
        provider: 'Ollama',
        createdAt: normalizeDate(model.modified_at),
      }))
    );
  } catch (e) {
    // Given this is an unauthenticated endpoint and we always try it, it's ok for this to
    // fail. It likely means that the user is not running ollama.
    if (verbose()) {
      console.error(`failed to fetch ollama models: ${String(e)}`);
    }
  }
  return models;
}

export default class ModelRegistry {
  private clientModels: NavieRpc.V1.Models.Model[] = [];
  private apiModels: NavieRpc.V1.Models.Model[] = [];
  private _selectedModel?: NavieRpc.V1.Models.Model;

  static readonly instance = new ModelRegistry();

  private constructor() {
    // no-op
  }

  select(model: NavieRpc.V1.Models.Model) {
    this._selectedModel = model;
  }

  get selectedModel(): NavieRpc.V1.Models.Model | undefined {
    return this._selectedModel;
  }

  add(model: NavieRpc.V1.Models.Model) {
    this.clientModels.push(model);
  }

  list(): NavieRpc.V1.Models.Model[] {
    return this.clientModels.concat(this.apiModels);
  }

  async refresh() {
    const promises: Promise<NavieRpc.V1.Models.Model[]>[] = [];
    const { ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENAI_BASE_URL } = process.env;

    if (ANTHROPIC_API_KEY) {
      promises.push(fetchAnthropicModels(ANTHROPIC_API_KEY));
    }

    if (OPENAI_API_KEY && (!OPENAI_BASE_URL || OPENAI_BASE_URL === 'https://api.openai.com')) {
      promises.push(fetchOpenAIModels(OPENAI_API_KEY));
    }

    promises.push(fetchOllamaModels());

    this.apiModels = (await Promise.all(promises)).flat();
  }
}
