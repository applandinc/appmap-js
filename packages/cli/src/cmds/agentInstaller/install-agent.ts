import Yargs from 'yargs';
import { promises as fs } from 'fs';
import {
  AbortError,
  ChildProcessError,
  InvalidPathError,
  ValidationError,
  UserConfigError,
} from '../errors';
import { endTime, prefixLines, verbose } from '../../utils';
import AgentInstallerProcedure from './agentInstallerProcedure';
import chalk from 'chalk';
import Telemetry from '../../telemetry';
import { INSTALLERS, INSTALLER_NAMES } from './installers';
import { getDirectoryProperty } from './telemetryUtil';
import { getProjects, ProjectConfiguration } from './projectConfiguration';
import AgentInstaller from './agentInstaller';
import { ProcessLog } from './commandRunner';
import openTicket from '../../lib/ticket/openTicket';
import InstallerUI from './installerUI';

interface InstallCommandOptions {
  verbose?: any;
  projectType?: string;
  directory: string;
  interactive: boolean;
  overwriteAppmapConfig?: boolean;
  installerName?: string;
  buildFile?: string;
}

class InstallerError {
  readonly error: Error;
  readonly log: string;

  constructor(error: unknown, readonly duration: number, readonly project?: ProjectConfiguration) {
    this.error = error instanceof Error ? error : new Error(String(error));
    this.log = ProcessLog.consumeBuffer();
  }

  get message(): string {
    if (this.error instanceof ValidationError || this.error instanceof ChildProcessError) {
      return this.error.message;
    } else if (this.error instanceof Error) {
      return this.error.stack || String(this.error);
    }

    return String(this.error);
  }

  async handle(ui: InstallerUI): Promise<boolean> {
    ui.error();

    const installersAvailable = this.project?.availableInstallers.map((i) => i.name).join(', ');

    if (this.error instanceof AbortError) {
      Telemetry.sendEvent({
        name: 'install-agent:abort',
        properties: {
          installer: this.project?.selectedInstaller?.name,
          installers_available: installersAvailable,
          reason: this.error.message,
          path: this.project?.path,
        },
        metrics: {
          duration: this.duration,
        },
      });

      ui.error(`${chalk.yellow('!')} Installation has been aborted.`);
      return true;
    } else if (this.error instanceof InvalidPathError) {
      Telemetry.sendEvent({
        name: 'install-agent:soft_failure',
        properties: {
          error: this.error.message,
          directory: this.project?.path ? await getDirectoryProperty(this.project.path) : undefined,
        },
      });

      ui.error(`${chalk.red('!')} ${this.error.message}`);
      return true;
    } else if (this.error instanceof UserConfigError) {
      ui.error(`${chalk.red('!')} Error in project configuration:\n\n${this.error?.message}`);

      Telemetry.sendEvent({
        name: 'install-agent:user-config-error',
        properties: {
          installer: this.project?.selectedInstaller?.name,
          installers_available: installersAvailable,
          error: this.error?.message,
          log: this.log,
          directory: this.project?.path ? await getDirectoryProperty(this.project.path) : undefined,
        },
      });
      return true;
    } else {
      let exception: string | undefined;
      if (this.error instanceof Error) {
        exception = this.error.stack;
      } else {
        exception = String(this.error);
      }

      let directoryContents: string | undefined;
      if (this.project?.path) {
        try {
          directoryContents = (await fs.readdir(this.project.path)).join('\n');
        } catch (e) {
          if (e instanceof Error) {
            directoryContents = e.stack;
          } else {
            directoryContents = String(e);
          }
        }
      }

      Telemetry.sendEvent({
        name: 'install-agent:failure',
        properties: {
          installer: this.project?.selectedInstaller?.name,
          installers_available: installersAvailable,
          exception_type: (this.error as any)?.constructor?.name,
          log: this.log,
          exception,
          directory: directoryContents,
          path: this.project?.path,
        },
        metrics: {
          duration: this.duration,
        },
      });
    }
    return false;
  }
}

const _handler = async (
  args: InstallCommandOptions
): Promise<{ exitCode: number; err: Error | null }> => {
  const {
    projectType,
    directory,
    verbose: isVerbose,
    interactive: interactiveArg,
    overwriteAppmapConfig: overwriteAppMapConfig,
    installerName,
    buildFile,
  } = args;
  const errors: InstallerError[] = [];
  const installers = INSTALLERS.map((constructor) => new constructor(directory));

  verbose(isVerbose);

  const interactive = interactiveArg !== undefined ? interactiveArg : process.stdout.isTTY;
  const ui = new InstallerUI(interactive, { overwriteAppMapConfig, installerName, buildFile });

  try {
    const projects = await getProjects(ui, installers, directory, true, projectType);

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const installProcedure = new AgentInstallerProcedure(
        project.selectedInstaller as AgentInstaller,
        project.path
      );

      ui.message(`Installing AppMap agent for ${chalk.blue(project.name)}...`);

      try {
        await installProcedure.run(ui);

        Telemetry.sendEvent({
          name: 'install-agent:success',
          properties: {
            installer: project.selectedInstaller!.name,
            path: project.path,
          },
          metrics: {
            duration: endTime(),
          },
        });
      } catch (e) {
        let installerError = new InstallerError(e, endTime(), project);
        const handled = await installerError.handle(ui);
        if (handled) {
          return { exitCode: 1, err: e as Error };
        }
        errors.push(installerError);
      }
    }

    if (errors.length) {
      const message =
        projects.length === 1
          ? 'Installation failed. View error details?'
          : `${errors.length} out of ${projects.length} installations failed. View error details?`;

      if (await ui.shouldShowError(message)) {
        errors.forEach((error) => {
          ui.error(
            projects.length > 1
              ? prefixLines(error.message, `[${chalk.red(error.project?.name)}] `)
              : error.message
          );
        });
      }
    }
  } catch (err) {
    const installerError = new InstallerError(err, 0, undefined);
    const handled = await installerError.handle(ui);
    if (handled) {
      return { exitCode: 1, err: err as Error };
    }
    errors.push(installerError);
  }

  if (errors.length) {
    if (ui.interactive) await openTicket(errors.map((e) => e.message));

    const reason = new Error(errors.map((e) => e.message).join('\n'));
    return { exitCode: 1, err: reason };
  }

  return { exitCode: 0, err: null };
};

export default {
  command: 'install [directory]',
  aliases: ['i', 'install-agent'],
  describe: 'Install and configure an AppMap language agent',
  builder(args: Yargs.Argv) {
    args.option('project-type', {
      describe: [
        'Specifies the project dependency manager. Case-insensitive.',
        `Supported project types: ${INSTALLER_NAMES.join(', ')}`,
      ].join('\n'),
      type: 'string',
      default: undefined,
      alias: 'p',
    });

    args.option('directory', {
      describe: 'Directory in which to install.',
      type: 'string',
      alias: 'd',
    });

    args.option('interactive', {
      describe: `Whether to interact with the user (assuming there's a TTY).`,
      type: 'boolean',
      default: true,
    });

    args.option('overwrite-appmap-config', {
      describe: `Whether to overwrite the appmap.yml file.`,
      type: 'boolean',
    });

    args.option('installer-name', {
      describe: `Installer name to use, in case of ambiguity.`,
      type: 'string',
    });

    args.option('build-file', {
      describe: `Build file name to use, in case of ambiguity.`,
      type: 'string',
    });

    args.positional('directory', {
      describe: 'Directory in which to install (deprecated; use -d)',
      default: '.',
    });
    return args.strict();
  },

  async handler(args: InstallCommandOptions): Promise<void> {
    Telemetry.sendEvent({
      name: 'install-agent:start',
    });

    const { exitCode, err } = await _handler(args);

    Telemetry.flush(() => {
      Yargs.exit(exitCode, err as any);
    });
  },
};
