import { promises as fs } from 'fs';
import JavaAgentInstaller from './javaAgentInstaller';
import RubyAgentInstaller from './rubyAgentInstaller';
import PythonAgentInstaller from './pythonAgentInstaller';
import { ValidationError, AbortError, InstallError } from '../errors';
import { verbose } from '../../utils';
import AgentInstallerProcedure from './agentInstallerProcedure';
import chalk from 'chalk';
import UI from '../userInteraction';
import Telemetry from '../../telemetry';
import AgentInstaller from './agentInstaller';
import { ProcessLog } from './commandRunner';

import Yargs from 'yargs';

const AGENT_INSTALLERS = {
  java: JavaAgentInstaller,
  ruby: RubyAgentInstaller,
  python: PythonAgentInstaller,
};

const AGENT_FRAMEWORK_INSTALLERS = Object.values(AGENT_INSTALLERS)
  .flatMap((installerLanguage) =>
    // Take every sub-installer and return it as an array of objects formatted like so:
    // { maven: { installerFramework: MavenAgentInstaller, installerLanguage: JavaAgentInstaller }}
    // { gradle: { installerFramework: GradleAgentInstaller, installerLanguage: JavaAgentInstaller }}
    // etc.
    installerLanguage.installers.map((installerFramework) => ({
      [new installerFramework().name.toLowerCase()]: {
        installerLanguage,
        installerFramework,
      },
    }))
  )
  .reduce((acc, entry) => ({ ...acc, ...entry }), {});

export const command = 'install-agent [project-type]';
export const describe = 'Install and configure an AppMap language agent';

function supportedTargetsMessage(): string {
  const supportedLanguages = Object.keys(AGENT_INSTALLERS)
    .map((name) => chalk.blue(name))
    .join(', ');

  const supportedFrameworks = Object.keys(AGENT_FRAMEWORK_INSTALLERS)
    .map((name) => chalk.blue(name))
    .join(', ');

  return [
    `Supported languages: ${supportedLanguages}`,
    `Supported project frameworks: ${supportedFrameworks}`,
  ].join('\n');
}

export const builder = (args) => {
  args.positional('project-type', {
    describe: [
      'Specifies the installation target. This may be a language or project framework. Case-insensitive.',
      supportedTargetsMessage(),
    ].join('\n'),
    type: 'string',
    default: undefined,
  });
  args.option('dir', {
    describe: 'directory in which to install',
    default: '.',
    alias: 'd',
  });
  return args.strict();
};

export const handler = async (argv) => {
  verbose(argv.verbose);
  const startTime = Date.now();
  const endTime = () => (Date.now() - startTime) / 1000;
  const { projectType, dir } = argv;
  let installer: AgentInstaller | undefined;

  let err: any;
  try {
    let installTarget = projectType;
    if (!installTarget) {
      const { result } = await UI.prompt({
        type: 'list',
        name: 'result',
        message: 'Select a target language for agent installation.',
        choices: Object.values(AGENT_INSTALLERS).map((i) => i.name),
      });
      installTarget = result;
    }

    installTarget = installTarget.toLowerCase();

    let installerOptions = AGENT_INSTALLERS[installTarget];
    let installerFramework;

    if (!installerOptions) {
      const installerInfo = AGENT_FRAMEWORK_INSTALLERS[installTarget];

      if (!installerInfo) {
        UI.error(
          [
            `${chalk.red(installTarget)} is not a supported installer type.`,
            supportedTargetsMessage(),
          ].join('\n')
        );
        throw new AbortError(`unsupported installer type \'${installTarget}\'`);
      }

      // The user has specified a framework
      installerOptions = installerInfo.installerLanguage;
      installerFramework = installTarget;
    }

    const installProcedure = new AgentInstallerProcedure(installerOptions, dir);
    installer = await installProcedure.run(installerFramework);

    Telemetry.sendEvent({
      name: 'install-agent:success',
      properties: {
        installer: installer.name,
      },
      metrics: {
        duration: endTime(),
      },
    });
  } catch (e) {
    let installersAvailable: string | undefined;
    err = e;

    if (e instanceof InstallError) {
      err = e.error;
      installer = e.installer;
    }

    try {
      // Map installers to their available status, e.g.,
      // { maven: true, gradle: false, pip: false }
      const installerStatuses = await Promise.all(
        Object.entries(AGENT_FRAMEWORK_INSTALLERS).map(
          async ([name, info]: [
            string,
            { installerFramework: new (...args: any[]) => AgentInstaller }
          ]) => {
            const framework = new info.installerFramework(dir);
            return [name, await framework.available()];
          }
        )
      );

      // Join the available installers into a string
      installersAvailable = installerStatuses
        .filter(([_, available]) => available)
        .map(([name]) => name)
        .join(', ');
    } catch (e) {
      if (e instanceof Error) {
        installersAvailable = e.stack;
      } else {
        installersAvailable = String(e);
      }
    }

    if (err instanceof AbortError) {
      await Telemetry.sendEvent({
        name: 'install-agent:abort',
        properties: {
          installer: installer?.name,
          installers_available: installersAvailable,
          reason: err.message,
        },
        metrics: {
          duration: endTime(),
        },
      });

      Yargs.exit(2, err);
    }

    let exception: string | undefined;
    if (err instanceof Error) {
      exception = err.stack;
    } else {
      exception = String(err);
    }

    let directory: string | undefined;
    try {
      directory = (await fs.readdir(dir)).join('\n');
    } catch (e) {
      if (e instanceof Error) {
        directory = e.stack;
      } else {
        directory = String(e);
      }
    }

    await Telemetry.sendEvent({
      name: 'install-agent:failure',
      properties: {
        installer: installer?.name,
        installers_available: installersAvailable,
        exception_type: (err as any)?.constructor?.name,
        log: ProcessLog.buffer,
        exception,
        directory,
      },
      metrics: {
        duration: endTime(),
      },
    });

    if (err instanceof ValidationError) {
      console.warn(err.message);
      return Yargs.exit(1, err);
    }

    UI.error(err);

    Yargs.exit(3, err);
  }
};
