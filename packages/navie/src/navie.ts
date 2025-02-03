import assert from 'assert';
import EventEmitter from 'events';
import { warn } from 'node:console';

import { LangchainMemoryService, NaiveMemoryService } from './services/memory-service';
import VectorTermsService from './services/vector-terms-service';
import InteractionHistory, {
  AgentSelectionEvent,
  ClassificationEvent,
  InteractionEvent,
} from './interaction-history';
import { ContextV2 } from './context';
import { UserContext } from './user-context';
import ProjectInfoService from './services/project-info-service';
import { ProjectInfoProvider } from './project-info';
import CodeSelectionService from './services/code-selection-service';
import { HelpProvider } from './help';
import AgentSelectionService from './services/agent-selection-service';
import LookupContextService from './services/lookup-context-service';
import ApplyContextService from './services/apply-context-service';
import ClassificationService from './services/classification-service';
import Command, { CommandMode } from './command';
import ExplainCommand from './commands/explain-command';
import ClassifyCommand from './commands/classify-command';
import Message from './message';
import VectorTermsCommand from './commands/vector-terms-command';
import ContextCommand from './commands/context-command';
import FileChangeExtractorService from './services/file-change-extractor-service';
import parseOptions from './lib/parse-options';
import stringOrDefault from './lib/string-or-default';
import Trajectory, { TrajectoryEvent } from './lib/trajectory';
import ListFilesCommand from './commands/list-files-command';
import MermaidFixerService from './services/mermaid-fixer-service';
import UpdateCommand from './commands/update-command';
import ComputeUpdateService from './services/compute-update-service';
import createCompletionService from './services/completion-service-factory';
import NextStepClassificationService from './services/next-step-classification-service';
import SuggestCommand from './commands/suggest-command';
import ObserveCommand from './commands/observe-command';
import ReviewCommand from './commands/review-command';
import WelcomeCommand from './commands/welcome-command';

export type ChatHistory = Message[];

export interface ClientRequest {
  question: string;
  codeSelection?: UserContext.Context;
  prompt?: string;
}

export interface INavie {
  on(event: 'event', listener: (event: InteractionEvent) => void): void;

  on(event: 'agent', listener: (agent: string) => void): void;

  on(event: 'classification', listener: (labels: ContextV2.ContextLabel[]) => void): void;

  on(event: 'trajectory', listener: (event: TrajectoryEvent) => void): void;

  execute(): AsyncIterable<string>;
}

export const DEFAULT_MODEL_NAME = 'gpt-4o';
export const DEFAULT_TOKEN_LIMIT = 8000;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_RESPONSE_TOKENS = 1000;

export class NavieOptions {
  modelName = process.env.APPMAP_NAVIE_MODEL ?? DEFAULT_MODEL_NAME;
  tokenLimit = Number(process.env.APPMAP_NAVIE_TOKEN_LIMIT ?? DEFAULT_TOKEN_LIMIT);
  temperature = Number(process.env.APPMAP_NAVIE_TEMPERATURE ?? DEFAULT_TEMPERATURE);
  responseTokens = Number(process.env.APPMAP_NAVIE_RESPONSE_TOKENS ?? DEFAULT_RESPONSE_TOKENS);
}

export interface NavieModel {
  id: string;
  provider: string;
}

export default function navie(
  clientRequest: ClientRequest,
  contextProvider: ContextV2.ContextProvider,
  projectInfoProvider: ProjectInfoProvider,
  helpProvider: HelpProvider,
  options: NavieOptions,
  chatHistory?: ChatHistory,
  model?: NavieModel
): INavie {
  if (options.modelName !== DEFAULT_MODEL_NAME) warn(`Using model ${options.modelName}`);
  if (options.tokenLimit !== DEFAULT_TOKEN_LIMIT) warn(`Using token limit ${options.tokenLimit}`);
  if (options.temperature !== DEFAULT_TEMPERATURE) warn(`Using temperature ${options.temperature}`);
  if (options.responseTokens !== DEFAULT_RESPONSE_TOKENS)
    warn(`Using response tokens ${options.responseTokens}`);

  const trajectory = new Trajectory();

  const interactionHistory = new InteractionHistory();

  const completionService = createCompletionService({ ...options, trajectory }, model);

  const classificationService = new ClassificationService(interactionHistory, completionService);

  const vectorTermsService = new VectorTermsService(interactionHistory, completionService);

  const contextProviderV2 = async (
    request: ContextV2.ContextRequest
  ): Promise<ContextV2.ContextResponse> =>
    contextProvider({ ...request, version: 2, type: 'search' });

  const lookupContextService = new LookupContextService(
    interactionHistory,
    contextProviderV2,
    helpProvider
  );

  const fileChangeExtractorService = new FileChangeExtractorService(
    interactionHistory,
    completionService
  );

  const buildExplainCommand = () => {
    const codeSelectionService = new CodeSelectionService(interactionHistory);

    const applyContextService = new ApplyContextService(interactionHistory);

    const mermaidFixerService = new MermaidFixerService(interactionHistory, completionService);

    const agentSelectionService = new AgentSelectionService(
      interactionHistory,
      vectorTermsService,
      lookupContextService,
      fileChangeExtractorService,
      applyContextService,
      mermaidFixerService
    );
    const projectInfoService = new ProjectInfoService(interactionHistory, projectInfoProvider);
    const memoryService = completionService.model
      ? new LangchainMemoryService(completionService.model)
      : NaiveMemoryService;

    return new ExplainCommand(
      options,
      interactionHistory,
      completionService,
      classificationService,
      agentSelectionService,
      codeSelectionService,
      projectInfoService,
      memoryService
    );
  };

  const fileChangeExtractor = new FileChangeExtractorService(interactionHistory, completionService);

  const buildClassifyCommand = () => new ClassifyCommand(classificationService);

  const buildVectorTermsCommand = () => new VectorTermsCommand(vectorTermsService);

  const buildListFileCommand = () => new ListFilesCommand(fileChangeExtractor);

  const computeUpdateService = new ComputeUpdateService(interactionHistory, completionService);

  const buildUpdateCommand = () => new UpdateCommand(interactionHistory, computeUpdateService);

  const buildContextCommand = () =>
    new ContextCommand(options, vectorTermsService, lookupContextService);

  const buildSuggestCommand = () => {
    const nextStepService = new NextStepClassificationService(completionService);
    return new SuggestCommand(nextStepService);
  };

  const buildObserveCommand = () => {
    const projectInfoService = new ProjectInfoService(interactionHistory, projectInfoProvider);
    return new ObserveCommand(
      options,
      completionService,
      lookupContextService,
      vectorTermsService,
      interactionHistory,
      projectInfoService
    );
  };

  const buildReviewCommand = () =>
    new ReviewCommand(options, completionService, lookupContextService, vectorTermsService);

  const buildWelcomeCommand = () => new WelcomeCommand(completionService);

  const commandBuilders: Record<CommandMode, () => Command> = {
    [CommandMode.Explain]: buildExplainCommand,
    [CommandMode.Classify]: buildClassifyCommand,
    [CommandMode.ListFiles]: buildListFileCommand,
    [CommandMode.Update]: buildUpdateCommand,
    [CommandMode.VectorTerms]: buildVectorTermsCommand,
    [CommandMode.Context]: buildContextCommand,
    [CommandMode.Suggest]: buildSuggestCommand,
    [CommandMode.Observe]: buildObserveCommand,
    [CommandMode.Review]: buildReviewCommand,
    [CommandMode.Welcome]: buildWelcomeCommand,
  };

  let { question } = clientRequest;
  question = question.trim();

  let commandName = CommandMode.Explain;
  for (const commandMode of Object.values(CommandMode)) {
    const prefix = `@${commandMode} `;
    if (question.startsWith(prefix) || question.split('\n')[0].trim() === `@${commandMode}`) {
      commandName = commandMode;
      question = question.slice(prefix.length);
      break;
    }
  }

  const command = commandBuilders[commandName]();

  const { options: userOptions, question: questionText } = parseOptions(question);

  // some models balk at empty questions, so use the command name if the question is empty
  clientRequest.question = stringOrDefault(questionText, commandName);

  class Navie extends EventEmitter implements INavie {
    constructor() {
      super();

      interactionHistory.on('event', (event: InteractionEvent) => {
        this.emit('event', event);

        if (event instanceof AgentSelectionEvent) {
          this.emit('agent', event.agent);
        }

        if (event instanceof ClassificationEvent) {
          this.emit('classification', event.classification);
        }
      });

      trajectory.on('event', (event: TrajectoryEvent) => {
        this.emit('trajectory', event);
      });
    }

    // eslint-disable-next-line class-methods-use-this
    async *execute(): AsyncIterable<string> {
      assert(command, 'Command not specified');

      for await (const chunk of command.execute(
        { ...clientRequest, userOptions },
        cleanHistory(chatHistory)
      ))
        yield chunk;
    }
  }

  return new Navie();
}

/**
 * Remove options from the messages; the chat history is given to the LLM
 * and it shouldn't see them lest they confuse it. Commands are ok.
 */
function cleanHistory(chatHistory?: ChatHistory): ChatHistory | undefined {
  if (!chatHistory) return undefined;

  return chatHistory.map((message) => ({
    ...message,
    content: parseOptions(message.content).question,
  }));
}
