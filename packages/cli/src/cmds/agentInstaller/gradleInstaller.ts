import fs from 'fs';
import os from 'os';
import { join, sep } from 'path';
import chalk from 'chalk';
import CommandStruct from './commandStruct';
import { verbose, exists } from '../../utils';
import InstallerUI from './installerUI';
import { getColumn, getWhitespace, Whitespace } from './sourceUtil';
import { AbortError } from '../errors';
import JavaBuildToolInstaller from './javaBuildToolInstaller';
import { GradleParser, GradleParseResult } from './gradleParser';
import EncodedFile from '../../encodedFile';

export default class GradleInstaller extends JavaBuildToolInstaller {
  static identifier = 'Gradle';

  constructor(path: string) {
    super(GradleInstaller.identifier, path);
  }

  get language(): string {
    return 'java';
  }

  get appmap_dir(): string {
    return 'build/appmap';
  }

  private get buildGradleFileName(): string {
    return 'build.gradle';
  }

  private get buildGradleKtsFileName(): string {
    return 'build.gradle.kts';
  }

  get buildFile(): string {
    return this.buildGradleFileName;
  }

  get buildFilePath(): string {
    return join(this.path, this.identifyGradleFile);
  }

  /**
   * If a build.gradle.kts file is present in the project, the installer will
   * choose that file as the build file.
   * If not, the installer will pick the build.gradle.
   */
  get identifyGradleFile(): string {
    const buildGradleKtsExists: boolean = fs.existsSync(
      join(this.path, this.buildGradleKtsFileName)
    );
    return buildGradleKtsExists ? this.buildGradleKtsFileName : this.buildGradleFileName;
  }

  async printJarPathCommand(): Promise<CommandStruct> {
    return new CommandStruct(await this.runCommand(), ['appmap-print-jar-path'], this.path);
  }

  async available(): Promise<boolean> {
    return await exists(this.buildFilePath);
  }

  async runCommand(): Promise<string> {
    const ext = os.platform() === 'win32' ? '.bat' : '';
    const wrapperExists = await exists(join(this.path, `gradlew${ext}`));

    if (wrapperExists) {
      return `.${sep}gradlew${ext}`;
    } else if (verbose()) {
      console.warn(
        `${chalk.yellow(`gradlew${ext} wrapper`)} not located, falling back to ${chalk.yellow(
          `gradle${ext}`
        )}`
      );
    }

    return 'gradle';
  }

  async verifyCommand(): Promise<CommandStruct> {
    return new CommandStruct(
      await this.runCommand(),
      [
        'dependencyInsight',
        '--dependency',
        'com.appland:appmap-agent',
        '--configuration',
        'appmapAgent',
        '--stacktrace',
      ],
      this.path
    );
  }

  /**
   * Add the com.appland.appmap plugin to build.gradle.
   *
   * Start by looking for an existing plugins block. If found, add our plugin to
   * it. If there's no plugins block, look for a buildscript block. If found,
   * insert a new plugins block after it. (Gradle requires that the plugins
   * block appear after the buildscript block, and before any other blocks.)
   *
   * If there's no plugins block, and no buildscript block, append a new plugins
   * block.
   *
   * @returns {updatedSrc: string, offset: number} updatedSrc is the source
   * updated to reference the plugin, offset is the index in the original source
   * from which copying should continue
   */
  async insertPluginSpec(
    ui: InstallerUI,
    buildFileSource: string,
    parseResult: GradleParseResult,
    whitespace: Whitespace
  ): Promise<{ updatedSrc: string; offset: number }> {
    const pluginSpec = this.selectPluginSpec();

    const lines = parseResult.plugins
      ? buildFileSource
          .substring(parseResult.plugins.lbrace + 1, parseResult.plugins.rbrace)
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
      : [];

    const javaPresent = lines.some((line) => line.match(/^\s*id\s+["']\s*java/));
    if (!javaPresent) {
      const userWillContinue = await ui.continueWithoutJavaPlugin();
      if (!userWillContinue) {
        throw new AbortError('no java plugin found');
      }
    }

    // Missing plugin block, so no java plugin, but the user opted to continue.
    if (!parseResult.plugins) {
      const pluginsBlock = `
plugins {
${whitespace.padLine(pluginSpec)}
}
`;
      const buildscriptEnd = parseResult.buildscript
        ? parseResult.buildscript.rbrace + 1
        : parseResult.startOffset;
      const updatedSrc = [buildFileSource.substring(0, buildscriptEnd), pluginsBlock].join(os.EOL);
      const offset = buildscriptEnd;
      return { updatedSrc, offset };
    }

    // Found plugin block, update it with plugin spec
    const existingIndex = lines.findIndex((line) => line.match(/com\.appland\.appmap/));

    if (existingIndex !== -1) {
      lines[existingIndex] = pluginSpec;
    } else {
      lines.push(pluginSpec);
    }

    const updatedSrc = [
      buildFileSource.substring(0, parseResult.plugins.lbrace + 1),
      lines.map((l) => whitespace.padLine(l)).join(os.EOL),
      '}',
    ].join(os.EOL);
    const offset = parseResult.plugins.rbrace + 1;

    return { updatedSrc, offset };
  }

  private selectPluginSpec() {
    const pluginSpecKotlinSyntax = `id("com.appland.appmap") version "1.1.0"`;
    const pluginSpecGroovySyntax = `id 'com.appland.appmap' version '1.1.0'`;
    return this.identifyGradleFile.endsWith('.gradle.kts')
      ? pluginSpecKotlinSyntax
      : pluginSpecGroovySyntax;
  }

  /**
   * Ensure the build file contains a buildscript block with mavenCentral in its
   * repositories.
   *
   * Returns a portion of the updated source, including everything through the
   * rbrace of the buildscript block. Also returns the offset into the original
   * source from which copying should continue.
   */
  async insertRepository(
    ui: InstallerUI,
    buildFileSource: string,
    updatedSrc: string,
    offset: number,
    parseResult: GradleParseResult,
    whitespace: Whitespace
  ): Promise<{ updatedSrc: string; offset: number }> {
    if (parseResult.mavenPresent) {
      // mavenPresent means there's already a repositories block with
      // mavenCentral in it, so just copy the rest of the original.
      return { updatedSrc, offset };
    }

    const addMavenCentral = await ui.addMavenCentral();
    if (!addMavenCentral) {
      return { updatedSrc, offset };
    }

    const mavenCentral = `mavenCentral()`;
    if (!parseResult.repositories) {
      const repositoriesBlock = `
repositories {
${whitespace.padLine(mavenCentral)}
}
`;
      updatedSrc += repositoriesBlock;
      return { updatedSrc, offset };
    }

    updatedSrc = [
      updatedSrc,
      buildFileSource.substring(offset, parseResult.repositories.rbrace),
      whitespace.padLine(mavenCentral),
    ].join('');
    offset = parseResult.repositories.rbrace - 1;
    return { updatedSrc, offset };
  }

  // TODO: validate the user's project before adding AppMap
  async checkConfigCommand(_ui: InstallerUI): Promise<CommandStruct | undefined> {
    return undefined;
  }

  async installAgent(ui: InstallerUI): Promise<void> {
    const encodedFile: EncodedFile = new EncodedFile(this.buildFilePath);
    const buildFileSource = encodedFile.toString();
    const parser = new GradleParser();
    const parseResult: GradleParseResult = parser.parse(buildFileSource);
    parser.checkSyntax(parseResult);
    const whitespace = getWhitespace(buildFileSource);

    let { updatedSrc, offset } = await this.insertPluginSpec(
      ui,
      buildFileSource,
      parseResult,
      whitespace
    );

    ({ updatedSrc, offset } = await this.insertRepository(
      ui,
      buildFileSource,
      updatedSrc,
      offset,
      parseResult,
      whitespace
    ));

    updatedSrc += buildFileSource.substring(offset);

    encodedFile.write(updatedSrc);
  }
}
