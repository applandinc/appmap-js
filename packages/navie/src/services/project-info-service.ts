import { dump } from 'js-yaml';
import {
  AppMapConfig,
  AppMapStats,
  CodeEditorInfo,
  ProjectInfo,
  ProjectInfoProvider,
} from '../project-info';
import InteractionHistory, { PromptInteractionEvent } from '../interaction-history';
import { PromptType, buildPromptDescriptor, buildPromptValue } from '../prompt';
import assert from 'assert';

type Test = () => boolean;

type MinimumStats = Omit<AppMapStats, 'routes' | 'tables' | 'packages'> & {
  routes?: string[];
  tables?: string[];
  packages?: string[];
};

export default class ProjectInfoService {
  constructor(
    public interactionHistory: InteractionHistory,
    public projectInfoProvider: ProjectInfoProvider
  ) {}

  async lookupProjectInfo(): Promise<ProjectInfo[]> {
    const response = await this.projectInfoProvider({ type: 'projectInfo' });
    if (!response) {
      this.interactionHistory.log('No project info found');
      return [];
    }

    const projectInfo = Array.isArray(response) ? response : [response];
    this.interactionHistory.log('Project info obtained');
    return projectInfo;
  }

  promptProjectInfo(isArchitecture: boolean, projectInfo: ProjectInfo[]) {
    const isLargeProject = (appmapStats: AppMapStats) =>
      appmapStats.packages.length > 20 ||
      appmapStats.routes.length > 20 ||
      appmapStats.tables.length > 20;

    const pruneStats = (stats: AppMapStats): MinimumStats => {
      if (isArchitecture || !isLargeProject(stats)) return stats;

      return {
        numAppMaps: stats.numAppMaps,
      };
    };

    const appmapConfigs = projectInfo
      .map((info) => info.appmapConfig)
      .filter(Boolean) as AppMapConfig[];
    const appmapStats = projectInfo
      .map((info) => info.appmapStats)
      .filter(Boolean)
      .map((stats) => (assert(stats), pruneStats(stats)));
    const codeEditors = projectInfo
      .map((info) => info.codeEditor)
      .filter(Boolean) as CodeEditorInfo[];

    if (appmapConfigs.length > 0) {
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.AppMapConfig,
          'system',
          buildPromptDescriptor(PromptType.AppMapConfig)
        )
      );
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.AppMapConfig,
          'user',
          buildPromptValue(PromptType.AppMapConfig, dump(appmapConfigs))
        )
      );
    } else {
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.AppMapConfig,
          'user',
          'The project does not contain an AppMap config file (appmap.yml).'
        )
      );
    }

    if (appmapStats.map((stats) => stats.numAppMaps).reduce((a, b) => a + b, 0) > 0) {
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.AppMapStats,
          'system',
          buildPromptDescriptor(PromptType.AppMapStats)
        )
      );
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.AppMapStats,
          'user',
          buildPromptValue(PromptType.AppMapStats, dump(appmapStats))
        )
      );
    } else {
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.AppMapStats,
          'user',
          'The project does not contain any AppMaps.'
        )
      );
    }

    if (codeEditors.length > 0) {
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.CodeEditor,
          'system',
          buildPromptDescriptor(PromptType.CodeEditor)
        )
      );
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.CodeEditor,
          'user',
          buildPromptValue(PromptType.CodeEditor, dump(codeEditors))
        )
      );
    } else {
      this.interactionHistory.addEvent(
        new PromptInteractionEvent(
          PromptType.CodeEditor,
          'user',
          'The code editor is not specified.'
        )
      );
    }
  }
}
