import { AbortError, ValidationError } from './errors';
import { verbose } from '../utils';
import UI from './userInteraction';
import chalk from 'chalk';
import Yargs from 'yargs';

export default async function runCommand(fn: () => Promise<any>) {
  return fn().catch((err) => {
    if (err instanceof ValidationError) {
      console.warn(err.message);
      return Yargs.exit(1, err);
    }
    if (err instanceof AbortError) {
      return Yargs.exit(2, err);
    }

    UI.error(err);

    Yargs.exit(3, err);
  });
}
