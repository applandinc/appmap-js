/* eslint-disable default-case */
/* eslint-disable consistent-return */
import { ExplainOptions } from '../explain';
import InteractionHistory from '../interaction-history';
import { Agent, AgentMode } from '../agent';
import { ProjectInfo } from '../project-info';
import { HelpAgent } from '../agents/help-agent';
import { HelpProvider } from '../help';
import VectorTermsService from './vector-terms-service';
import { GenerateAgent } from '../agents/generate-agent';
import LookupContextService from './lookup-context-service';
import ApplyContextService from './apply-context-service';
import ExplainAgent from '../agents/explain-agent';

type AgentModeResult = { agent: Agent; question: string };

const MODE_PREFIXES = {
  '@explain ': {
    mode: AgentMode.Explain,
    endUserDescription:
      'This is the default mode. Navie will explain something about your project.',
  },
  '@generate ': {
    mode: AgentMode.Generate,
    endUserDescription:
      'Provides help with AppMap related behavior, such as recording agents, best practices, installation, and more.',
  },
  '@help ': {
    mode: AgentMode.Help,
    endUserDescription: 'This mode is optimized for code generation.',
  },
};

type ModeDescriptor = {
  mode: string;
  endUserDescription: string;
};

export const AvailableModes: ReadonlyArray<ModeDescriptor> = Object.values(MODE_PREFIXES);

export default class AgentSelectionService {
  constructor(
    private history: InteractionHistory,
    private helpProvider: HelpProvider,
    private vectorTermsService: VectorTermsService,
    private lookupContextService: LookupContextService,
    private applyContextService: ApplyContextService
  ) {}

  selectAgent(
    question: string,
    options: ExplainOptions,
    _projectInfo: ProjectInfo[]
  ): AgentModeResult {
    let modifiedQuestion = question;

    const helpAgent = () => new HelpAgent(this.history, this.helpProvider, this.vectorTermsService);

    const generateAgent = () =>
      new GenerateAgent(
        this.history,
        this.vectorTermsService,
        this.lookupContextService,
        this.applyContextService
      );

    const explainAgent = () =>
      new ExplainAgent(
        this.history,
        this.vectorTermsService,
        this.lookupContextService,
        this.applyContextService
      );

    const buildAgent = {
      [AgentMode.Help]: helpAgent,
      [AgentMode.Generate]: generateAgent,
      [AgentMode.Explain]: explainAgent,
    };

    const optionMode = () => {
      if (options.agentMode) {
        this.history.log(
          `[mode-selection] Activating agent due to explicit option: ${options.agentMode}`
        );
        const agent = buildAgent[options.agentMode]();
        return { question, agent };
      }
    };

    const questionPrefixMode = () => {
      for (const [prefix, { mode }] of Object.entries(MODE_PREFIXES)) {
        if (question.startsWith(prefix)) {
          modifiedQuestion = question.slice(prefix.length);
          this.history.log(`[mode-selection] Activating agent due to question prefix: ${mode}`);
          const agent = buildAgent[mode]();
          return { question: modifiedQuestion, agent };
        }
      }
    };

    const defaultMode = () => {
      this.history.log(`[mode-selection] Using default mode: ${AgentMode.Explain}`);
      return { question, agent: explainAgent() };
    };

    return optionMode() || questionPrefixMode() || defaultMode();
  }
}
