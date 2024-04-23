import { utimesSync } from 'fs';
import Fingerprinter from '../../src/fingerprint/fingerprinter';
import { CodeObject, CodeObjectMatch } from '../../src/search/types';
import { findFiles, verbose } from '../../src/utils';
import path from 'path';
import { exec } from 'child_process';

if (process.env.DEBUG) {
  verbose(true);
}

export const fixtureDir = path.join(__dirname, 'fixtures');

export function stripCodeObjectParents(codeObjectMatches: CodeObjectMatch[]): CodeObjectMatch[] {
  const strip = (codeObject: CodeObject): void => {
    codeObject.parent = undefined;
    codeObject.children = undefined;
    (codeObject.children || []).forEach(strip);
  };
  codeObjectMatches.forEach((com) => strip(com.codeObject));
  return codeObjectMatches;
}

export async function indexDirectory(dir: string): Promise<void> {
  const now = new Date();
  const fingerprinter = new Fingerprinter();
  await findFiles(dir, '.appmap.json', async (fileName) => {
    utimesSync(fileName, now, now);
    await fingerprinter.fingerprint(fileName);
  });
}

async function executeWorkspaceOSCommand(cmd: string, workingDirectory: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    exec(cmd, { cwd: workingDirectory }, (err, stdout, stderr) => {
      if (err) {
        console.log(stdout);
        console.warn(stderr);
        return reject(err);
      }
      resolve();
    });
  });
}

export async function cleanProject(workingDirectory: string) {
  const commands = [`git checkout HEAD .`, `git clean -fdx .`];
  for (const command of commands) {
    try {
      await executeWorkspaceOSCommand(command, workingDirectory);
    } catch (e) {
      console.log(e);
    }
  }
}
