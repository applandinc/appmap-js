import { ProjectInfo } from '@appland/navie';
import { collectStats } from '../../rpc/appmap/stats';
import configuration from '../../rpc/configuration';
import { getDiffLog, getWorkingDiff } from '../../lib/git';

export default async function collectProjectInfos(
  codeEditor: string | undefined,
  params: ProjectInfo.ProjectInfoRequest = { type: 'projectInfo' }
): Promise<ProjectInfo.ProjectInfo[]> {
  const projectInfoByPath = new Map<string, ProjectInfo.ProjectInfo>();

  const projectInfo = (directory: string): ProjectInfo.ProjectInfo => {
    const info = projectInfoByPath.get(directory);
    if (info) return info;

    const result = { directory };
    projectInfoByPath.set(directory, result);
    return result;
  };

  const appmapDirectories = await configuration().appmapDirectories();

  const appmapStats = await collectStats(appmapDirectories);
  appmapStats.forEach((stats) => {
    const { directory } = stats;

    // KG: This is verbose and I don't see the utility of it
    delete (stats as Record<string, unknown>).classes;
    delete (stats as Record<string, unknown>).path;

    projectInfo(directory).appmapStats = stats;
  });

  appmapDirectories.forEach((dir) => {
    projectInfo(dir.directory).appmapConfig = {
      name: dir.appmapConfig.name,
      language: dir.appmapConfig.language ?? 'unknown',
      appmap_dir: dir.appmapConfig.appmap_dir ?? 'tmp/appmap',
      packages: dir.appmapConfig.packages,
    };
  });

  if (params.includeDiff) {
    const { baseBranch } = params;

    // for (const [directory, info] of projectInfoByPath) {
    //   const diffContent = (
    //     await Promise.all([getWorkingDiff(directory), getDiffLog(undefined, baseBranch, directory)])
    //   )
    //     .filter(Boolean)
    //     .join('\n\n');

    //   info.diff = diffContent;
    // }
  }

  const { projectDirectories } = configuration();
  if (codeEditor) {
    projectDirectories.forEach((dir) => {
      projectInfo(dir).codeEditor = { name: codeEditor };
    });
  }
  return [...projectInfoByPath.values()].sort((a, b) => a.directory.localeCompare(b.directory));
}
