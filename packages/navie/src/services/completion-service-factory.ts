import { warn } from 'node:console';

import GoogleVertexAICompletionService from './google-vertexai-completion-service';
import OpenAICompletionService from './openai-completion-service';
import AnthropicCompletionService from './anthropic-completion-service';
import CompletionService from './completion-service';
import Trajectory from '../lib/trajectory';
import MessageTokenReducerService from './message-token-reducer-service';
import { NavieModel } from '../navie';

interface Options {
  modelName: string;
  temperature: number;
  trajectory: Trajectory;
  backend?: Backend;
}

const BACKENDS = {
  anthropic: AnthropicCompletionService,
  openai: OpenAICompletionService,
  'vertex-ai': GoogleVertexAICompletionService,
} as const;

type Backend = keyof typeof BACKENDS;

function determineCompletionBackend(): Backend {
  switch (process.env.APPMAP_NAVIE_COMPLETION_BACKEND) {
    case 'anthropic':
    case 'openai':
    case 'vertex-ai':
      return process.env.APPMAP_NAVIE_COMPLETION_BACKEND;
    default:
    // pass
  }
  if ('ANTHROPIC_API_KEY' in process.env) return 'anthropic';
  if ('GOOGLE_WEB_CREDENTIALS' in process.env) return 'vertex-ai';
  if ('OPENAI_API_KEY' in process.env) return 'openai';
  return 'openai'; // fallback
}

export const SELECTED_BACKEND: Backend = determineCompletionBackend();

export default function createCompletionService(
  { modelName, temperature, trajectory, backend = determineCompletionBackend() }: Options,
  model?: NavieModel
): CompletionService {
  const messageTokenReducerService = new MessageTokenReducerService();
  if (model) {
    switch (model.provider.toLowerCase()) {
      case 'anthropic':
        return new AnthropicCompletionService(
          model.id,
          temperature,
          trajectory,
          messageTokenReducerService
        );
      case 'ollama':
        return new OpenAICompletionService(
          model.id,
          temperature,
          trajectory,
          messageTokenReducerService,
          'http://localhost:11434/v1'
        );
      case 'openai':
        return new OpenAICompletionService(
          model.id,
          temperature,
          trajectory,
          messageTokenReducerService
        );
      case 'vertex-ai':
        return new GoogleVertexAICompletionService(model.id, temperature, trajectory);
      default:
        warn(`Unknown model provider ${model.provider}`);
        return new OpenAICompletionService(
          model.id,
          temperature,
          trajectory,
          messageTokenReducerService
        );
    }
  }

  warn(`Using completion service ${backend}`);
  return new BACKENDS[backend](modelName, temperature, trajectory, messageTokenReducerService);
}
