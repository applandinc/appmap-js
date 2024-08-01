import { AppMapRpc } from '@appland/rpc';
import { RpcHandler } from './rpc';
import { processNamedFiles } from './utils';
import { readFile } from 'fs/promises';
import configuration, { AppMapDirectory } from './configuration';
import { join } from 'path';

type Stats = {
  name: string;
  directory: string;
  packages: string[];
  classes: string[];
  routes: string[];
  tables: string[];
  numAppMaps: number;
};

async function getAppmapStats(appmapDirectory: AppMapDirectory): Promise<Stats> {
  const packages = new Set<string>();
  const classes = new Set<string>();
  const routes = new Set<string>();
  const tables = new Set<string>();
  let numAppMaps = 0;

  const appmapDir = join(
    appmapDirectory.directory,
    appmapDirectory.appmapConfig.appmap_dir ?? 'tmp/appmap'
  );
  const collectStrings = (values: Set<string>): ((file: string) => Promise<void>) => {
    return async (file: string): Promise<void> => {
      for (const value of JSON.parse(await readFile(file, 'utf-8'))) values.add(value);
    };
  };

  await processNamedFiles(appmapDir, 'canonical.packages.json', collectStrings(packages));
  await processNamedFiles(appmapDir, 'canonical.classes.json', collectStrings(classes));
  await processNamedFiles(
    appmapDir,
    'canonical.httpServerRequests.json',
    async (file: string): Promise<void> => {
      for (const value of JSON.parse(await readFile(file, 'utf-8'))) routes.add(value.route);
    }
  );
  await processNamedFiles(appmapDir, 'canonical.sqlTables.json', collectStrings(tables));
  await processNamedFiles(appmapDir, 'metadata.json', async () => numAppMaps++);

  return {
    name: appmapDirectory.appmapConfig.name || appmapDirectory.directory,
    directory: appmapDirectory.directory,
    packages: Array.from(packages).sort(),
    classes: Array.from(classes).sort(),
    routes: Array.from(routes).sort(),
    tables: Array.from(tables).sort(),
    numAppMaps,
  };
}

export async function collectStats(
  preloadedAppMapDirectories?: AppMapDirectory[]
): Promise<Stats[]> {
  const appmapDirectories =
    preloadedAppMapDirectories ?? (await configuration().appmapDirectories());
  const stats = await Promise.all(appmapDirectories.map((appmapDir) => getAppmapStats(appmapDir)));
  return stats.sort((a, b) => a.name.localeCompare(b.name));
}
