import { log, warn } from 'console';
import EventEmitter from 'events';
import { randomUUID } from 'crypto';

import { ContextV2, Help, Navie, navie, ProjectInfo, UserContext } from '@appland/navie';

import INavie from './inavie';
import Telemetry from '../../../telemetry';
import {
  AI,
  CreateAgentMessage,
  CreateUserMessage,
  UpdateAgentMessage,
  UpdateUserMessage,
} from '@appland/client';
import reportFetchError from './report-fetch-error';
import assert from 'assert';
import { initializeHistory, loadThread } from './historyHelper';
import { THREAD_ID_REGEX } from './history';
import Trajectory from './trajectory';
import ModelRegistry from '../../navie/models/registry';

const OPTION_SETTERS: Record<
  string,
  (navieOptions: Navie.NavieOptions, value: string | number) => void
> = {
  tokenLimit: (navieOptions, value) => {
    navieOptions.tokenLimit = typeof value === 'string' ? parseInt(value, 10) : value;
  },
  temperature: (navieOptions, value) => {
    navieOptions.temperature = typeof value === 'string' ? parseFloat(value) : value;
  },
  modelName: (navieOptions, value) => {
    navieOptions.modelName = String(value);
  },
  explainMode: () => {
    warn(`Option 'explainMode' is deprecated and will be ignored`);
  },
};

export default class LocalNavie extends EventEmitter implements INavie {
  public navieOptions = new Navie.NavieOptions();
  public trajectory: Trajectory | undefined;

  assignedThreadId: string | undefined;

  constructor(
    private readonly contextProvider: ContextV2.ContextProvider,
    private readonly projectInfoProvider: ProjectInfo.ProjectInfoProvider,
    private readonly helpProvider: Help.HelpProvider
  ) {
    super();
  }

  // Sets a thread id to use with the request.
  // The caller is responsible for ensuring that the thread id is a unique, valid uuid.
  setThreadId(threadId: string) {
    if (!THREAD_ID_REGEX.test(threadId)) throw new Error(`Invalid thread id: ${threadId}`);

    this.assignedThreadId = threadId;
  }

  setTrajectoryHandler(trajectory: Trajectory) {
    this.trajectory = trajectory;
  }

  get providerName() {
    return 'local';
  }

  setOption(key: keyof typeof OPTION_SETTERS, value: string | number) {
    const setter = OPTION_SETTERS[key];
    if (setter) {
      setter(this.navieOptions, value);
    } else {
      throw new Error(`LocalNavie does not support option '${key}'`);
    }
  }

  async ask(
    threadId: string | undefined,
    question: string,
    codeSelection?: UserContext.Context,
    prompt?: string
  ): Promise<void> {
    if (!threadId) {
      if (this.assignedThreadId) {
        warn(`[local-navie] No threadId provided for question. Using client-specified threadId.`);
        // eslint-disable-next-line no-param-reassign
        threadId = this.assignedThreadId;
      } else {
        warn(`[local-navie] No threadId provided for question. Allocating a new threadId.`);
        // eslint-disable-next-line no-param-reassign
        threadId = randomUUID();
      }
    }

    let userMessageId: string;
    {
      const userMessage: CreateUserMessage = {
        questionLength: question.length,
      };
      if (codeSelection) userMessage.codeSelectionLength = codeSelection.length;

      userMessageId =
        (
          await reportFetchError(
            'createUserMessage',
            () => (assert(threadId), AI.createUserMessage(threadId, userMessage))
          )
        )?.id ?? randomUUID();
    }

    let agentMessageId: string;
    {
      const agentMessage: CreateAgentMessage = {};

      agentMessageId =
        (
          await reportFetchError(
            'createAgentMessage',
            () => (assert(threadId), AI.createAgentMessage(threadId, agentMessage))
          )
        )?.id ?? randomUUID();
    }

    const history = initializeHistory();
    const thread = await loadThread(history, threadId);

    this.#reportConfigTelemetry();
    log(`[local-navie] Processing question ${userMessageId} in thread ${threadId}`);
    this.emit('ack', userMessageId, threadId);

    try {
      const clientRequest: Navie.ClientRequest = {
        question,
        codeSelection,
        prompt,
      };

      await history.question(threadId, userMessageId, question, codeSelection, prompt);

      const startTime = Date.now();

      const navieFn = navie(
        clientRequest,
        this.contextProvider,
        this.projectInfoProvider,
        this.helpProvider,
        this.navieOptions,
        thread.messages,
        ModelRegistry.instance.selectedModel
      );

      let agentName: string | undefined;
      let classification: ContextV2.ContextLabel[] | undefined;

      navieFn.on('event', (event) => this.emit('event', event));
      navieFn.on('agent', (agent) => (agentName = agent));
      navieFn.on('classification', (labels) => (classification = labels));
      if (this.trajectory)
        navieFn.on('trajectory', this.trajectory.logMessage.bind(this.trajectory));

      const response = new Array<string>();
      for await (const token of navieFn.execute()) {
        response.push(token);
        await history.token(threadId, userMessageId, agentMessageId, token);
        this.emit('token', token, agentMessageId);
      }
      const endTime = Date.now();
      const duration = endTime - startTime;

      warn(`[local-navie] Completed question ${userMessageId} in ${duration}ms`);

      {
        const userMessage: UpdateUserMessage = {
          agentName,
          classification,
        };
        await reportFetchError('updateUserMessage', () =>
          AI.updateUserMessage(userMessageId, userMessage)
        );
      }
      {
        const agentMessage: UpdateAgentMessage = {
          responseLength: response.join('').length,
          responseTime: duration,
        };
        await reportFetchError('updateAgentMessage', () =>
          AI.updateAgentMessage(agentMessageId, agentMessage)
        );
      }

      this.emit('complete');
    } catch (e) {
      this.emit('error', e);
      throw e;
    }
  }

  #skipTelemetry = !Telemetry.enabled;

  #reportConfigTelemetry() {
    if (this.#skipTelemetry) return;
    Telemetry.sendEvent({
      name: 'navie-local',
      properties: {
        modelName: this.navieOptions.modelName,
        azureVersion: process.env.AZURE_OPENAI_API_VERSION,
      },
    });
    this.#skipTelemetry = true;
  }
}
