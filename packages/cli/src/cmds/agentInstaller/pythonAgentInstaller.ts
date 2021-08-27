/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */

import { join } from 'path';
import { promises as fsp } from 'fs';
import AgentInstaller from './agentInstaller';
import CommandStruct from './commandStruct';
import { exists } from '../../utils';
import chalk from 'chalk';

const REGEX_PKG_DEPENDENCY = /^\s*appmap\s*[=>~]+=.*$/m;
// include .dev0 so pip will allow prereleases
const PKG_DEPENDENCY = 'appmap>=1.1.0.dev0';

export class PoetryInstaller implements AgentInstaller {
  constructor(readonly path: string) {}

  get name(): string {
    return 'poetry';
  }

  get buildFile(): string {
    return 'poetry.lock';
  }

  get buildFilePath(): string {
    return join(this.path, this.buildFile);
  }

  postInstallMessage(): string {
    return [
      `Run your tests with ${chalk.blue('APPMAP=true')} in the environment.`,
      `By default, AppMap files will be output to ${chalk.blue('tmp/appmap')}.`,
    ].join('\n');
  }

  async available(): Promise<boolean> {
    return await exists(this.buildFilePath);
  }

  verifyCommand(): CommandStruct {
    return new CommandStruct(
      'poetry',
      ['add', '--dev', '--allow-prereleases', 'appmap'],
      this.path
    );
  }

  initCommand(): CommandStruct {
    return new CommandStruct('poetry', ['run', 'appmap-agent-init'], this.path);
  }

  installAgent(): void {
    throw new Error('Not yet implemented');
  }
}

export class PipInstaller implements AgentInstaller {
  constructor(readonly path: string) {}

  get name(): string {
    return 'pip';
  }

  get buildFile(): string {
    return 'requirements.txt';
  }

  get buildFilePath(): string {
    return join(this.path, this.buildFile);
  }

  postInstallMessage(): string {
    return [
      `Run your tests with ${chalk.blue('APPMAP=true')} in the environment.`,
      `By default, AppMap files will be output to ${chalk.blue('tmp/appmap')}.`,
    ].join('\n');
  }

  async available(): Promise<boolean> {
    return await exists(this.buildFilePath);
  }

  verifyCommand(): CommandStruct {
    return new CommandStruct(
      'pip',
      ['install', '-r', this.buildFile],
      this.path
    );
  }

  async installAgent(): Promise<void> {
    let requirements = (await fsp.readFile(this.buildFilePath)).toString();

    const pkgExists = requirements.search(REGEX_PKG_DEPENDENCY) !== -1;

    if (pkgExists) {
      // Replace the existing package declaration entirely.
      requirements = requirements.replace(REGEX_PKG_DEPENDENCY, PKG_DEPENDENCY);
    } else {
      // Insert a new package declaration.
      // eslint-disable-next-line prefer-template
      requirements = `${PKG_DEPENDENCY}\n` + requirements;
    }

    await fsp.writeFile(this.buildFilePath, requirements);
  }

  initCommand(): CommandStruct {
    return new CommandStruct('appmap-agent-init', [], this.path);
  }
}

const PythonAgentInstaller = {
  name: 'Python',
  documentation: 'https://appland.com/docs/reference/appmap-python',
  installers: [PipInstaller],
};

export default PythonAgentInstaller;
