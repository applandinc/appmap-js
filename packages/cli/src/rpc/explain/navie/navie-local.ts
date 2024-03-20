import { log } from 'console';
import EventEmitter from 'events';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import { Context, Explain, Message, ProjectInfo, explain } from '@appland/navie';

import INavie from './inavie';

class LocalHistory {
  constructor(public readonly threadId: string) {}

  async saveMessage(message: Message) {
    await this.initHistory();
    const timestampNumber = Date.now();
    const historyFile = join(this.historyDir, `${timestampNumber}.json`);
    await writeFile(historyFile, JSON.stringify(message, null, 2));
  }

  async restoreMessages(): Promise<Message[]> {
    await this.initHistory();
    const historyFiles = (await readdir(this.historyDir)).sort();
    const history: Message[] = [];
    for (const historyFile of historyFiles) {
      const historyPath = join(this.historyDir, historyFile);
      const historyString = await readFile(historyPath, 'utf-8');
      const message = JSON.parse(historyString);
      history.push(message);
    }
    return history;
  }

  protected async initHistory() {
    await mkdir(this.historyDir, { recursive: true });
  }

  protected get historyDir() {
    return join(homedir(), '.appmap', 'navie', 'history', this.threadId);
  }
}

const OPTION_SETTERS: Record<string, (explainOptions: Explain.ExplainOptions, value: string | number) => void> = {
  tokenLimit: (explainOptions, value) => {
    explainOptions.tokenLimit = value as number;
  },
  temperature: (explainOptions, value) => {
    explainOptions.temperature = value as number;
  },
  modelName: (explainOptions, value) => {
    explainOptions.modelName = String(value);
  },
}

export default class LocalNavie extends EventEmitter implements INavie {
  public history: LocalHistory;
  public explainOptions = new Explain.ExplainOptions();

  constructor(
    public threadId: string | undefined,
    private readonly contextProvider: Context.ContextProvider,
    private readonly projectInfoProvider: ProjectInfo.ProjectInfoProvider
  ) {
    super();

    if (threadId) {
      log(`[local-navie] Continuing thread ${threadId}`);
      this.threadId = threadId;
    } else {
      this.threadId = randomUUID();
      log(`[local-navie] Starting new thread ${this.threadId}`);
    }
    this.threadId = threadId || randomUUID();
    this.history = new LocalHistory(this.threadId);
  }

  setOption(key: keyof typeof OPTION_SETTERS, value: string | number) { 
    const setter = OPTION_SETTERS[key];
    if (setter) {
      setter(this.explainOptions, value);
    } else {
      throw new Error(`LocalNavie does not support option '${key}'`);
    }
  }

  async ask(question: string, codeSelection: string | undefined): Promise<void> {
    const messageId = randomUUID();
    log(`[local-navie] Processing question ${messageId} in thread ${this.threadId}`);
    this.emit('ack', messageId, this.threadId);

    const clientRequest: Explain.ClientRequest = {
      question,
      codeSelection,
    };

    const history = await this.history.restoreMessages();
    this.history.saveMessage({ content: question, role: 'user' });

    const explainFn = explain(
      clientRequest,
      this.contextProvider,
      this.projectInfoProvider,
      this.explainOptions,
      history
    );
    explainFn.on('event', (event) => this.emit('event', event));
    const response = new Array<string>();
    for await (const token of explainFn.execute()) {
      response.push(token);
      this.emit('token', token);
    }
    this.history.saveMessage({ content: response.join(''), role: 'system' });
    this.emit('complete');
  }
}
