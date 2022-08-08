import { mkdirp } from 'fs-extra';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import UI from '../../userInteraction';
import { readConfigOption } from '../configuration';

export default async function saveAppMap(jsonData: any, appMapName: string) {
  const data = JSON.stringify(jsonData);

  const fileName = `${appMapName}.appmap.json`;
  const outputDir = join(
    (await readConfigOption('appmap_dir', 'tmp/appmap')) as string,
    'remote'
  );
  await mkdirp(outputDir);

  UI.status = `Saving recording to ${fileName} in directory ${outputDir}`;

  await writeFile(join(outputDir, fileName), data);

  UI.success('AppMap saved');

  return join(outputDir, fileName);
}
