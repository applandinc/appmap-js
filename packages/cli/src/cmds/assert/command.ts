import process from 'process';
import { verbose } from '../../utils';
import ValidationError from '../error/validationError';
import AbortError from '../error/abortError';
import * as fs from 'fs';
import 'fs/promises';
import * as console from 'console';
import { buildAppMap } from '../../search/utils';
import AssertionChecker from './assertionChecker';
import Assertion from './assertion';
import ProgressFormatter from './formatter/progressFormatter';
import PrettyFormatter from './formatter/prettyFormatter';
import { glob as globCallback } from 'glob';
import { promisify } from 'util';

export default {
  command: 'assert',
  describe: 'Run assertions for AppMaps in the directory',

  builder(args) {
    args.option('appmap-dir', {
      describe: 'directory to recursively inspect for AppMaps',
      default: 'tmp/appmap',
    });
    args.option('config', {
      describe:
        'path to assertions config file. The path indicated should default-export a function which returns an Assertion[].',
      default: './defaultAssertions',
      alias: 'c',
    });
    args.option('format', {
      describe: 'output format',
      default: 'progress',
      options: ['progress', 'pretty'],
    });

    return args.strict();
  },

  handler(argv) {
    verbose(argv.verbose);

    const commandFn = async () => {
      const { appmapDir, config, format } = argv;

      if (!fs.existsSync(appmapDir)) {
        throw new ValidationError(
          `AppMaps directory ${appmapDir} does not exist.`
        );
      }

      let summary = { passed: 0, failed: 0, skipped: 0 };
      const checker = new AssertionChecker();
      const formatter =
        format === 'progress' ? new ProgressFormatter() : new PrettyFormatter();
      const assertionsFn = (await import(config)).default;
      const assertions: Assertion[] = assertionsFn();

      const glob = promisify(globCallback);
      const files: string[] = await glob(`${appmapDir}/**/*.appmap.json`);

      let index = 0;

      files.forEach((file: string) => {
        const appMap = buildAppMap()
          .source(JSON.parse(fs.readFileSync(file, 'utf-8').toString()))
          .normalize()
          .build();

        process.stdout.write(formatter.appMap(appMap));

        assertions.forEach((assertion: Assertion) => {
          const result = checker.check(appMap, assertion);

          if (result === true) {
            summary.passed++;
            index++;
          } else if (result === false) {
            index++;
            summary.failed++;
          } else {
            summary.skipped++;
          }

          const message = formatter.result(assertion, result, index);
          if (message) {
            process.stdout.write(message);
          }
        });
      });

      process.stdout.write('\n\n');
      process.stdout.write(
        formatter.summary(summary.passed, summary.skipped, summary.failed)
      );

      return process.exit(summary.failed === 0 ? 0 : 1);
    };

    return commandFn().catch((err) => {
      if (err instanceof ValidationError) {
        console.warn(err.message);
        return process.exit(1);
      }
      if (err instanceof AbortError) {
        return process.exit(2);
      }

      throw err;
    });
  }
}
