import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { join } from 'path';
import { promisify } from 'util';
import yargs from 'yargs';
import { handleWorkingDirectory } from '../lib/handleWorkingDirectory';
import loadAppMapConfig from '../lib/loadAppMapConfig';
import { verbose } from '../utils';
import gitDeletedFiles from './archive/gitDeletedFiles';
import gitModifiedFiles from './archive/gitModifiedFiles';
import gitNewFiles from './archive/gitNewFiles';
import { Metadata } from './archive/Metadata';
import runTests from './archive/runTests';

export const command = 'update';
export const describe = 'Update AppMaps by running new and out-of-date tests';

export const builder = (args: yargs.Argv) => {
  args.option('directory', {
    describe: 'program working directory',
    type: 'string',
    alias: 'd',
  });
  args.option('appmap-dir', {
    describe: 'directory to recursively inspect for AppMaps',
  });

  args.option('base-appmap-dir', {
    describe: 'directory in which base AppMaps are available',
    type: 'string',
    demandOption: true,
  });

  args.option('test-folder', {
    describe: 'folder in which tests are located',
    array: true,
  });

  args.option('test-command', {
    describe: 'command to invoke with the updated (added + modified) tests',
    array: true,
  });

  return args.strict();
};

export const handler = async (argv: any) => {
  verbose(argv.verbose);

  const { baseAppmapDir } = argv;

  handleWorkingDirectory(argv.directory);
  const appmapConfig = await loadAppMapConfig();
  if (!appmapConfig) throw new Error(`Unable to load appmap.yml config file`);

  const testFoldersArgument = (): string[] | undefined => argv.testFolder;
  const testFoldersConfig = (): string[] | undefined => appmapConfig.preflight?.test_folders;

  const testFolders = testFoldersArgument() || testFoldersConfig();
  if (!testFolders)
    console.warn(
      chalk.yellow(`No test folders specified. Use --test-folder arguments, or configure 
test_folders in appmap.yml. In the absence of this information, all added and changed files will
be included in the file arguments passed to the test runner.`)
    );

  const testCommandsArgument = (): Record<string, string> | undefined => {
    const testCommands = argv.testCommand as string[] | undefined;
    if (!testCommands) return;

    return testCommands.reduce((memo, line) => {
      const match = /\[([^\]]+)\]\s+(.*)/.exec(line);
      if (!match) {
        console.warn(chalk.red(`Invalid test command: ${line}`));
      } else {
        const folder = match[1];
        const command = match[2];
        memo[folder] = command;
      }
      return memo;
    }, {});
  };
  const testCommandsConfig = (): Record<string, string> | undefined =>
    appmapConfig.preflight?.test_commands;
  const testCommands = testCommandsArgument() || testCommandsConfig();

  const fullArchives = (
    await Promise.all<Metadata>(
      (
        await promisify(glob)(join(baseAppmapDir, 'appmap_archive.*.json'))
      ).map(async (metadataFile) => JSON.parse(await readFile(metadataFile, 'utf8')))
    )
  ).filter((metadata) => !metadata.baseRevision);

  if (fullArchives.length !== 1)
    throw new Error(
      `Expecting exactly one full archive in ${baseAppmapDir}, found ${fullArchives.length}.`
    );

  const baseRevision = fullArchives[0].revision;

  const addedTestFiles = await gitNewFiles(testFolders);
  const modifiedTestFiles = await gitModifiedFiles(baseRevision, testFolders);
  const deletedTestFiles = await gitDeletedFiles(baseRevision, testFolders);
  const updatedTestFiles = [...new Set([...addedTestFiles, ...modifiedTestFiles])].sort();

  if (addedTestFiles.length > 0) console.log(`Added tests: ${addedTestFiles.join(' ')}`);
  if (modifiedTestFiles.length > 0) console.log(`Modified tests: ${modifiedTestFiles.join(' ')}`);
  if (deletedTestFiles.length > 0) console.log(`Deleted tests: ${deletedTestFiles.join(' ')}`);
  if (updatedTestFiles.length > 0)
    console.log(`Updated (added+modified) tests: ${updatedTestFiles.join(' ')}`);

  const testFilesByFolder = new Map<string, string[]>();
  updatedTestFiles.forEach((testFile) => {
    testFolders?.forEach((folder) => {
      if (testFile.startsWith(folder))
        testFilesByFolder.set(folder, [...(testFilesByFolder.get(folder) || []), testFile]);
    });
  });

  for (const [folder, testFiles] of testFilesByFolder.entries()) {
    const command = testCommands?.[folder];
    if (!command) {
      console.warn(chalk.yellow(`No test command configured for folder ${folder}`));
      continue;
    }
    runTests(command, testFiles);
  }
};
