/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */

import os from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { exists } from '../../utils';
import AgentInstaller from './agentInstaller';
import { run } from './commandRunner';
import { getOutput } from './commandUtil';
import CommandStruct from './commandStruct';
import EncodedFile from '../../encodedFile';
import { BundlerConfigError } from '../errors';
import InstallerUI from './installerUI';

const REGEX_GEM_DECLARATION = /^(?:gem|group|require)\s/m;

const REGEX_GEM_DEPENDENCY = /^\s*gem\s+['|"]appmap['|"].*$/m;
const GEM_DEPENDENCY = "gem \"appmap\", :groups => [:development, :test]";

export class BundleInstaller extends AgentInstaller {
  static identifier = 'Bundler';

  constructor(path: string) {
    super('Bundler', path);
  }

  get language(): string {
    return 'ruby';
  }

  get appmap_dir(): string {
    return 'tmp/appmap';
  }

  get buildFile(): string {
    return 'Gemfile';
  }

  get buildFilePath(): string {
    return join(this.path, this.buildFile);
  }

  get documentation() {
    return 'https://appland.com/docs/reference/appmap-ruby';
  }

  async available(): Promise<boolean> {
    return await exists(this.buildFilePath);
  }

  async checkConfigCommand(_ui: InstallerUI): Promise<CommandStruct | undefined> {
    return new CommandStruct('bundle', ['check', '--dry-run'], this.path);
  }

  async checkBundlerConfig(): Promise<void> {
    const bundleConfig = await run(
      new CommandStruct('bundle', ['config', 'get', 'without'], this.path)
    );

    const activeConfig = bundleConfig.stdout.split('\n')[1];
    if (activeConfig && activeConfig.includes(':development') && activeConfig.includes(':test')) {
      throw new BundlerConfigError(
        'Bundler is currently configured to install without the test and development groups\n'
      );
    }
  }

  async installAgent(_ui: InstallerUI): Promise<void> {
    await this.checkBundlerConfig();
    const encodedFile: EncodedFile = new EncodedFile(this.buildFilePath);
    let gemfile = encodedFile.toString();
    const index = gemfile.search(REGEX_GEM_DECLARATION);

    if (index !== -1) {
      const gemExists = gemfile.search(REGEX_GEM_DEPENDENCY) !== -1;

      if (gemExists) {
        // Replace the existing gem declaration entirely
        gemfile = gemfile.replace(REGEX_GEM_DEPENDENCY, `${os.EOL}${GEM_DEPENDENCY}`);
      } else {
        // Insert a new gem declaration
        const chars = gemfile.split('');
        chars.splice(index, 0, `${GEM_DEPENDENCY}${os.EOL + os.EOL}`);
        gemfile = chars.join('');
      }

      encodedFile.write(gemfile);
    } else {
      encodedFile.write(`${gemfile}${os.EOL}${GEM_DEPENDENCY}${os.EOL}`);
    }

    await run(new CommandStruct('bundle', ['install'], this.path));
  }

  async initCommand(): Promise<CommandStruct> {
    return new CommandStruct('bundle', ['exec', 'appmap-agent-init'], this.path);
  }

  async validateAgentCommand(): Promise<CommandStruct> {
    return new CommandStruct('bundle', ['exec', 'appmap-agent-validate'], this.path);
  }

  async environment(): Promise<Record<string, string>> {
    // Ruby version is returned as a string similar to:
    // ruby 3.0.0p0 (2020-12-25 revision 95aff21468) [x86_64-linux]
    const version = await getOutput('ruby', ['--version'], this.path);
    const gemHome = await getOutput('gem', ['env', 'home'], this.path);

    return {
      'Ruby version': version.ok ? version.output.split(/\s/)[1] : chalk.red(version.output),
      'Gem home': gemHome.ok ? gemHome.output : chalk.red(gemHome.output),
    };
  }

  async verifyCommand() {
    return undefined;
  }
}
