#! /usr/bin/env node
/* eslint-disable no-use-before-define */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-underscore-dangle */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable func-names */
/* eslint-disable max-classes-per-file */

const yargs = require('yargs');
const { diffLines } = require('diff');
const yaml = require('js-yaml');
const { promises: fsp, readFileSync } = require('fs');
const { queue } = require('async');
const readline = require('readline');
const { join } = require('path');
const cliProgress = require('cli-progress');
const { tmpdir } = require('os');
const { algorithms, canonicalize } = require('./fingerprint');
const { verbose, loadAppMap } = require('./utils');
const appMapCatalog = require('./appMapCatalog');
const FingerprintDirectoryCommand = require('./fingerprint/fingerprintDirectoryCommand');
const FingerprintWatchCommand = require('./fingerprint/fingerprintWatchCommand');
const Depends = require('./depends');
const FindCodeObjects = require('./search/findCodeObjects');
const FindEvents = require('./search/findEvents');
const FunctionStats = require('./functionStats');
const Inspect = require('./inspect');
const SwaggerCommand = require('./swagger/command');
const InstallCommand = require('./cmds/agentInstaller/install-agent');
const InventoryCollector = require('./inventory/buildInventory');
const {
  printAddedLine,
  printRemovedLine,
  printObject,
  printChangedLine,
} = require('./cli/output');
const { textIfy } = require('./inventory/util');

class DiffCommand {
  public appMapNames: any;
  public baseDir?: string;
  public baseAppMapNames: any;
  public baseCatalog: any;
  public workingAppMapNames: any;
  public workingCatalog: any;
  public workingDir?: string;

  setBaseDir(dir) {
    this.baseDir = dir;
    return this;
  }

  setWorkingDir(dir) {
    this.workingDir = dir;
    return this;
  }

  /**
   * Limits the diff computation to a specific AppMaps.
   *
   * @param {string[]} names
   */
  setAppMapNames(names) {
    this.appMapNames = new Set(names);
    return this;
  }

  /**
   * Gets the names of all AppMaps which are added in the working set.
   */
  async added() {
    await this._loadCatalogs();

    return [...this.workingAppMapNames].filter(
      (x) => !this.baseAppMapNames.has(x)
    );
  }

  /**
   * Gets the names of all AppMaps which are present in the base set but not present
   * in the working set.
   */
  async removed() {
    await this._loadCatalogs();

    return [...this.baseAppMapNames].filter(
      (x) => !this.workingAppMapNames.has(x)
    );
  }

  /**
   * Gets the names of all AppMaps which have present in both sets, but whose fingerprints
   * have changed.
   *
   * @param {string} algorithmName Name of the canonicalization algorithm to use for the
   * comparison.
   */
  async changed(algorithmName) {
    await this._loadCatalogs();

    const result: string[] = [];
    Object.keys(this.workingCatalog)
      .filter((name) => this.baseCatalog[name])
      .filter(this._includesAppMap.bind(this))
      .forEach((name) => {
        const base = this.baseCatalog[name];
        const working = this.workingCatalog[name];
        if (!base.metadata.fingerprints || !working.metadata.fingerprints) {
          console.warn(`No metadata.fingerprints found on AppMap ${name}`);
          return;
        }

        const baseFingerprint = base.metadata.fingerprints.find(
          (fingerprint) =>
            fingerprint.canonicalization_algorithm === algorithmName
        );
        const workingFingerprint = working.metadata.fingerprints.find(
          (fingerprint) =>
            fingerprint.canonicalization_algorithm === algorithmName
        );
        if (!baseFingerprint || !workingFingerprint) {
          console.warn(
            `No ${algorithmName} fingerprint found on AppMap ${name}`
          );
          return;
        }

        if (baseFingerprint.digest !== workingFingerprint.digest) {
          result.push(name);
        }
      });
    return result;
  }

  _includesAppMap(name) {
    return !this.appMapNames || this.appMapNames.has(name);
  }

  // eslint-disable-next-line no-underscore-dangle
  async _loadCatalogs() {
    if (!this.workingDir) {
      throw new Error('Working directory must be specified');
    }
    // TODO: Other modes of loading the base data, such as from a remote server, can be supported
    // in the future.
    if (!this.baseDir) {
      throw new Error('Base directory must be specified');
    }

    this.workingCatalog = await appMapCatalog(this.workingDir);
    this.baseCatalog = await appMapCatalog(this.baseDir);

    this.workingAppMapNames = new Set(
      Object.keys(this.workingCatalog).filter(this._includesAppMap.bind(this))
    );
    this.baseAppMapNames = new Set(
      Object.keys(this.baseCatalog).filter(this._includesAppMap.bind(this))
    );
  }
}

class DetailedDiff {
  protected algorithm: string;
  protected baseAppMap: any;
  protected workingAppMap: any;

  constructor(algorithm, baseAppMap, workingAppMap) {
    this.algorithm = algorithm;
    this.baseAppMap = baseAppMap;
    this.workingAppMap = workingAppMap;
  }

  async diff() {
    const canonicalizeAppMap = (appmap) => {
      const canonicalForm = canonicalize(this.algorithm, appmap);
      return yaml.dump(canonicalForm);
    };
    const baseDoc = canonicalizeAppMap(this.baseAppMap);
    const workingDoc = canonicalizeAppMap(this.workingAppMap);
    return diffLines(baseDoc, workingDoc);
  }
}

// eslint-disable-next-line no-unused-expressions
yargs(process.argv.slice(2))
  .command(
    'diff',
    'Compute the difference between two mapsets',
    (args) => {
      args.option('name', {
        describe: 'indicate a specific AppMap to of compare',
      });
      args.option('show-diff', {
        describe:
          'compute the diff of the canonicalized forms of each changed AppMap',
        boolean: true,
      });
      args.option('appmap-dir', {
        describe: 'directory containing work-in-progress AppMaps',
      });
      args.option('base-dir', {
        describe: 'directory containing base version AppMaps',
      });
    },
    async function (argv) {
      verbose(argv.verbose);

      let baseDir;
      let workingDir;
      const { showDiff } = argv;

      // eslint-disable-next-line prefer-const
      baseDir = argv.baseDir;
      // eslint-disable-next-line prefer-const
      workingDir = argv.appmapDir;

      if (!baseDir) {
        throw new Error('Location of base version AppMaps is required');
      }
      if (!workingDir) {
        throw new Error('Location of work-in-progress AppMaps is required');
      }

      const diff = new DiffCommand()
        .setBaseDir(baseDir)
        .setWorkingDir(workingDir);

      if (argv.name) {
        diff.setAppMapNames([argv.name]);
      }

      const diffObject = {
        added: [...(await diff.added())].sort(),
        changed: <any[]>[],
        removed: <any>undefined,
      };

      const cumulativeChangedAppMaps = new Set();
      const changed = await Promise.all(
        Object.keys(algorithms)
          .map(function (algorithm) {
            return async function () {
              const rawList = await diff.changed(algorithm);
              const changedAppMaps = rawList.filter(
                (name) => !cumulativeChangedAppMaps.has(name)
              );
              changedAppMaps.forEach((name) =>
                cumulativeChangedAppMaps.add(name)
              );
              const changeResult = {
                algorithm,
                changed: <any[]>[],
              };
              if (changedAppMaps.length > 0) {
                if (showDiff) {
                  changeResult.changed = await Promise.all(
                    changedAppMaps.map(
                      // eslint-disable-next-line prettier/prettier
                      async function (name) {
                        return {
                          name,
                          diff: await new DetailedDiff(
                            algorithm,
                            await loadAppMap(diff.baseCatalog[name].fileName),
                            await loadAppMap(diff.workingCatalog[name].fileName)
                          ).diff(),
                        };
                      }
                    )
                  );
                } else {
                  changeResult.changed = changedAppMaps.map((name) => ({
                    name,
                  }));
                }
              }
              return changeResult;
            };
          })
          .map((func) => func())
      );
      diffObject.changed = changed;
      diffObject.removed = [...(await diff.removed())].sort();

      console.log(yaml.dump(diffObject));
    }
  )
  .command(
    'depends [files]',
    'Compute a list of AppMaps that are out of date',
    (args) => {
      args.positional('files', {
        describe: 'provide an explicit list of dependency files',
      });
      args.option('appmap-dir', {
        describe: 'directory to recursively inspect for AppMaps',
        default: 'tmp/appmap',
      });
      args.option('base-dir', {
        describe: 'directory to prepend to each dependency source file',
        default: '.',
      });
      args.option('field', {
        describe: 'print a field from each matching AppMap',
      });
      args.option('stdin-files', {
        describe:
          'read the list of changed files from stdin, one file per line',
        boolean: true,
      });
      return args.strict();
    },
    async (argv) => {
      verbose(argv.verbose);

      let { files } = argv;
      if (argv.stdinFiles) {
        const stdinFileStr = readFileSync(0).toString();
        const stdinFiles = stdinFileStr.split('\n');
        files = (files || []).concat(stdinFiles);
        if (verbose()) {
          console.warn(`Computing depends on ${files.join(', ')}`);
        }
      }

      if (verbose()) {
        console.warn(`Testing AppMaps in ${argv.appmapDir}`);
      }

      const depends = new Depends(argv.appmapDir);
      if (argv.baseDir) {
        depends.baseDir = argv.baseDir;
      }
      if (files) {
        depends.files = files;
      }

      const appMapNames = await depends.depends();
      const values: any[] = [];
      if (argv.field) {
        const { field } = argv;
        const q = queue(async (appMapBaseName: string) => {
          const data = await fsp.readFile(
            join(appMapBaseName, 'metadata.json')
          );
          const metadata = JSON.parse(data);
          const value = metadata[field];
          if (value) {
            const tokens = value.split(':');
            values.push(tokens[0]);
          } else {
            console.warn(`No ${field} in ${appMapBaseName}`);
          }
        }, 5);
        appMapNames.forEach((name) => q.push(name));
        await q.drain();
      } else {
        appMapNames.forEach((name) => values.push(name));
      }
      console.log(Array.from(new Set(values)).sort().join('\n'));
    }
  )
  .command(
    'inspect <code-object>',
    'Search AppMaps for references to a code object (package, function, class, query, route, etc) and print available event info',
    (args) => {
      args.positional('code-object', {
        describe: 'identifies the code-object to inspect',
      });
      args.option('appmap-dir', {
        describe: 'directory to recursively inspect for AppMaps',
        default: 'tmp/appmap',
      });
      args.option('base-dir', {
        describe:
          'directory to recursively inspect for base version AppMaps (used for the "compare" feature)',
      });
      args.option('interactive', {
        describe: 'interact with the output via CLI',
        alias: 'i',
        boolean: true,
      });
      return args.strict();
    },
    async (argv) => {
      verbose(argv.verbose);

      const newProgress = () => {
        if (argv.interactive) {
          return new cliProgress.SingleBar(
            {},
            cliProgress.Presets.shades_classic
          );
        }

        return {
          increment: () => {},
          start: () => {},
          stop: () => {},
        };
      };

      console.warn('Indexing the AppMap database');
      await new FingerprintDirectoryCommand(argv.appmapDir).execute();
      if (argv.baseDir) {
        console.warn('Indexing the base AppMap database');
        await new FingerprintDirectoryCommand(argv.baseDir).execute();
      }

      const newState = (appmapDir, codeObjectId, filters) => ({
        appmapDir,
        codeObjectId,
        codeObjectMatches: [],
        filters: filters || [],
        stats: null,
      });

      const buildStats = async (state: any) => {
        const result: any[] = [];
        console.warn('Finding matching Events');
        const progress = newProgress();
        progress.start(state.codeObjectMatches.length, 0);
        await Promise.all(
          state.codeObjectMatches.map(async (codeObjectMatch) => {
            const findEvents = new FindEvents(
              codeObjectMatch.appmap,
              codeObjectMatch.codeObject
            );
            findEvents.filter(state.filters);
            const events = await findEvents.matches();
            result.push(...events);
            progress.increment();
          })
        );
        progress.stop();
        console.warn('Collating results...');
        state.stats = new FunctionStats(result);
      };

      const buildBaseStats = async () => {
        const baseState = newState(
          argv.baseDir,
          workingState.codeObjectId,
          // eslint-disable-next-line prettier/prettier
          [...workingState.filters]
        );
        await findCodeObjects(baseState);
        return baseState;
      };

      const findCodeObjects = async (state) => {
        console.warn('Finding matching AppMaps');
        const { appmapDir, codeObjectId } = state;
        const progress = newProgress();
        const finder = new FindCodeObjects(appmapDir, codeObjectId);
        state.codeObjectMatches = await finder.find(
          (count) => progress.start(count, 0),
          progress.increment.bind(progress)
        );
        progress.stop();
        await buildStats(state);
      };

      const workingState = newState(argv.appmapDir, argv.codeObject, []);
      await findCodeObjects(workingState);

      const interactive = () => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.on('close', function () {
          yargs.exit(0, new Error());
        });

        const home = () => Inspect.home(workingState, getCommand);

        const filter = () => Inspect.filter(rl, workingState, buildStats, home);

        const undoFilter = async () =>
          Inspect.undoFilter(workingState, buildStats, home);

        const navigate = async () =>
          Inspect.navigate(rl, workingState, findCodeObjects, home);

        const compare = async () =>
          Inspect.compare(rl, workingState, buildBaseStats, home);

        const reset = async () => Inspect.reset(workingState, buildStats, home);

        const print = () => Inspect.print(rl, workingState, getCommand, home);

        const quit = () => rl.close();

        const getCommand = () => {
          console.log();

          const options = {
            home,
            print,
            filter,
            'undo filter': undoFilter,
            navigate,
          };
          if (argv.baseDir) {
            options['compare'] = compare;
          }
          options['reset filters'] = reset;
          options['quit'] = quit;

          const prompt = `${Object.keys(options)
            .map((opt) => `(${opt.charAt(0)})${opt.substring(1)}`)
            .join(', ')}: `;

          rl.question(prompt, (command) => {
            let cmd;
            const commandName = Object.keys(options).find(
              (opt) => opt.charAt(0) === command
            );
            if (commandName) {
              cmd = options[commandName];
            }
            if (!cmd) {
              return getCommand();
            }

            return cmd();
          });
        };

        home();
      };
      if (argv.interactive) {
        interactive();
      } else {
        console.log(JSON.stringify(workingState.stats, null, 2));
      }
    }
  )
  .command(
    'index',
    'Compute fingerprints and update index files for all appmaps in a directory',
    (args) => {
      args.option('watch', {
        describe: 'watch the directory for changes to appmaps',
        boolean: true,
      });
      args.option('appmap-dir', {
        describe: 'directory to recursively inspect for AppMaps',
        default: 'tmp/appmap',
      });
      return args.strict();
    },
    async (argv) => {
      verbose(argv.verbose);

      if (argv.watch) {
        const cmd = new FingerprintWatchCommand(argv.appmapDir);
        await cmd.execute();

        if (!argv.verbose) {
          process.stdout.write('\x1B[?25l');
          const consoleLabel = 'AppMaps processed: 0';
          process.stdout.write(consoleLabel);
          setInterval(() => {
            readline.cursorTo(process.stdout, consoleLabel.length - 1);
            process.stdout.write(`${cmd.numProcessed}`);
          }, 200);

          process.on('beforeExit', (/* _code */) => {
            process.stdout.write(`\x1B[?25h`);
          });
        }
      } else {
        const cmd = new FingerprintDirectoryCommand(argv.appmapDir);
        await cmd.execute();
      }
    }
  )
  .command(
    'inventory',
    'Generate canonical lists of the application code object inventory',
    (args) => {
      args.option('inventory', {
        describe: 'pre-existing inventory file',
      });
      args.option('appmap-dir', {
        describe: 'directory to recursively inspect for AppMaps',
      });
      args.option('base-dir', {
        describe:
          'directory to recursively inspect for base version AppMaps. When this option is provided, this command computes and prints the difference between the inventories',
      });
      args.option('base-mapset', {
        describe:
          'mapset id for base version AppMaps. When this option is provided, this command computes and prints the difference between the inventories. AppMap Cloud (server) credentials must be available for this to work.',
      });
      args.option('base-inventory', {
        describe:
          'base inventory file. . When this option is provided, this command computes and prints the difference between the inventories.',
      });
      args.option('format', {
        describe: 'output format (text, yaml)',
        options: ['text', 'yaml'],
        default: 'text',
      });
      return args.strict();
    },
    async (argv) => {
      verbose(argv.verbose);

      let inventory;

      if (argv.inventory) {
        inventory = yaml.load(await fsp.readFile(argv.inventory));
      } else if (argv.appmapDir) {
        await new FingerprintDirectoryCommand(argv.appmapDir).execute();
        inventory = await new InventoryCollector(argv.appmapDir).execute();
      }

      if (!inventory) {
        console.warn(`Either 'inventory' or 'appmap-dir' is required`);
        yargs.exit(1);
      }

      const workingAppMaps = inventory.appMaps
        .map(JSON.parse)
        .reduce((memo, appMap) => {
          memo[appMap.name] = appMap;
          return memo;
        }, {});

      let baseDir;
      if (argv.baseDir) {
        baseDir = argv.baseDir;
      } else if (argv.baseMapset) {
        // eslint-disable-next-line global-require
        const listAppMaps = require('./appland/listAppMaps');
        // eslint-disable-next-line global-require
        const getAppMap = require('./appland/getAppMap');

        const baseAppMaps = await listAppMaps(argv.baseMapset);
        baseDir = await fsp.mkdtemp(join(tmpdir(), 'appmap_'));
        console.log(`Saving remote AppMaps to ${baseDir}`);

        const workingInfoFingerprints: any = Object.values(
          workingAppMaps
        ).reduce((memo: any, appMap: any) => {
          memo.add(appMap.infoFingerprint);
          return memo;
        }, new Set());

        await Promise.all(
          baseAppMaps.map(async (appMap) => {
            if (appMap.metadata.fingerprints) {
              const baseInfoFingerprint = appMap.metadata.fingerprints.find(
                (fp) => fp.canonicalization_algorithm === 'info'
              ).digest;
              if (workingInfoFingerprints.has(baseInfoFingerprint)) {
                return;
              }
            }
            const uuid = appMap.scenario_uuid;
            const baseAppMap = await getAppMap(uuid);
            if (verbose()) {
              console.log(`${baseAppMap.metadata.name} (${uuid})`);
            }
            fsp.writeFile(
              join(baseDir, [uuid, 'appmap.json'].join('.')),
              JSON.stringify(baseAppMap)
            );
          })
        );
      }

      let baseInventory;
      if (argv.baseInventory) {
        baseInventory = yaml.load(await fsp.readFile(argv.baseInventory));
      } else if (baseDir) {
        await new FingerprintDirectoryCommand(baseDir).execute();
        baseInventory = await new InventoryCollector(baseDir).execute();
      }

      if (baseInventory) {
        const printSectionName = (sectionName) => {
          console.log(
            `\x1b[1m%s%s\x1b[0m`,
            sectionName.charAt(0).toUpperCase(),
            sectionName.slice(1)
          );
          console.log(
            `\x1b[1m%s\x1b[0m`,
            new Array(sectionName.length + 1).join('=')
          );
        };

        {
          printSectionName('AppMaps');

          const baseAppMaps = baseInventory.appMaps
            .map(JSON.parse)
            .reduce((memo, appMap) => {
              memo[appMap.name] = appMap;
              return memo;
            }, {});
          let changedCount = 0;
          const allNames = new Set(
            Object.keys(workingAppMaps).concat(Object.keys(baseAppMaps))
          );
          await Promise.all(
            [...allNames].map(async (appMapName) => {
              if (!baseAppMaps[appMapName]) {
                changedCount += 1;
                printAddedLine(textIfy(workingAppMaps[appMapName], false));
              } else if (!workingAppMaps[appMapName]) {
                changedCount += 1;
                printRemovedLine(textIfy(baseAppMaps[appMapName], false));
              } else if (
                baseAppMaps[appMapName].infoFingerprint !==
                workingAppMaps[appMapName].infoFingerprint
              ) {
                changedCount += 1;
                printChangedLine(textIfy(workingAppMaps[appMapName], false));
              }
            })
          );
          console.log(`${changedCount} changes`);
          console.log(`${allNames.size} total`);
          console.log();
        }

        const packageName = (id) => {
          const tokens = id.split('/');
          return tokens.slice(0, tokens.length - 1).join('/');
        };
        const className = (id) => id.split(/[#.]/)[0];

        const changed = new Set();
        const addedCodeObjects = new Set();
        const removedCodeObjects = new Set();
        {
          const workingSet = new Set(inventory.functionTrigrams);
          const baseSet = new Set(baseInventory.functionTrigrams);
          const union = new Set(
            inventory.functionTrigrams.concat(baseInventory.functionTrigrams)
          );
          const all = new Set();
          [...union].sort().forEach((trigramStr: any) => {
            const trigram = JSON.parse(trigramStr);
            trigram.forEach((entry) => all.add(JSON.stringify(entry)));
            if (!baseSet.has(trigramStr) || !workingSet.has(trigramStr)) {
              const entry = trigram[1];
              changed.add(JSON.stringify(entry));
              if (entry.function) {
                changed.add(
                  JSON.stringify({ package: packageName(entry.function) })
                );
                changed.add(
                  JSON.stringify({ class: className(entry.function) })
                );
                changed.add(JSON.stringify({ function: entry.function }));
              }
            }
          });
        }

        const objectifyClass = (name) => ({
          class: name,
        });
        const objectifyQuery = (name) => ({
          query: name,
        });
        const objectifyRequest = (request) => ({
          route: request.route,
          parameters: request.parameters,
          status: request.status,
        });

        const sectionKeys = Object.keys(inventory).filter(
          (key) => key !== 'appMaps'
        );
        const sectionObjectifier = {
          classes: objectifyClass,
          sqlNormalized: objectifyQuery,
          httpServerRequests: objectifyRequest,
          httpClientRequests: objectifyRequest,
        };
        sectionKeys.forEach((sectionName) => {
          const workingSet = new Set(inventory[sectionName]);
          const baseSet = new Set(baseInventory[sectionName]);
          const union = new Set(
            inventory[sectionName].concat(baseInventory[sectionName])
          );

          const objectifier = sectionObjectifier[sectionName];

          printSectionName(sectionName);

          /*
          console.log(addedCodeObjects);
          console.log(removedCodeObjects);
          */

          function diffPrinter() {
            let changedCount = 0;
            [...union].sort().forEach((obj) => {
              const rootAddedOrRemoved = (stack) => {
                if (
                  sectionName !== 'functionTrigrams' &&
                  sectionName !== 'stacks'
                ) {
                  return false;
                }
                return JSON.parse(stack).some((entry) => {
                  let key;
                  if (entry.route) {
                    key = JSON.stringify(objectifyRequest(entry));
                  } else if (entry.query) {
                    key = JSON.stringify(objectifyQuery(entry.query));
                  } else if (entry.function) {
                    key = JSON.stringify(
                      objectifyClass(className(entry.function))
                    );
                  }
                  if (!key) {
                    return false;
                  }
                  return (
                    addedCodeObjects.has(key) || removedCodeObjects.has(key)
                  );
                });
              };

              if (!baseSet.has(obj) && !rootAddedOrRemoved(obj)) {
                changedCount += 1;
                printAddedLine(textIfy(obj));
                if (sectionName === 'httpServerRequests') {
                  addedCodeObjects.add(
                    JSON.stringify(objectifyRequest(JSON.parse(obj as any)))
                  );
                }
                if (sectionName === 'classes') {
                  addedCodeObjects.add(
                    JSON.stringify(objectifyClass(JSON.parse(obj as any)))
                  );
                }
                if (sectionName === 'sqlNormalized') {
                  addedCodeObjects.add(
                    JSON.stringify(objectifyQuery(JSON.parse(obj as any)))
                  );
                }
              } else if (!workingSet.has(obj) && !rootAddedOrRemoved(obj)) {
                changedCount += 1;
                printRemovedLine(textIfy(obj));
                if (sectionName === 'httpServerRequests') {
                  removedCodeObjects.add(
                    JSON.stringify(objectifyRequest(JSON.parse(obj as any)))
                  );
                }
                if (sectionName === 'classes') {
                  removedCodeObjects.add(
                    JSON.stringify(objectifyClass(JSON.parse(obj as any)))
                  );
                }
                if (sectionName === 'sqlNormalized') {
                  removedCodeObjects.add(
                    JSON.stringify(objectifyQuery(JSON.parse(obj as any)))
                  );
                }
              } else if (
                objectifier &&
                changed.has(JSON.stringify(objectifier(JSON.parse(obj as any))))
              ) {
                changedCount += 1;
                printChangedLine(textIfy(obj));
              }
            });

            return { changed: changedCount, total: union.size };
          }

          const { changed: changedCount, total } = diffPrinter();

          console.log(`${changedCount} changes`);
          console.log(`${total} total`);
          console.log();
        });
      } else {
        printObject(
          inventory,
          argv.format
        );
      }
    }
  )
  .command(
    'swagger',
    'Generate Swagger from AppMaps in a directory',
    (args) => {
      args.option('appmap-dir', {
        describe: 'directory to recursively inspect for AppMaps',
        default: 'tmp/appmap',
      });
      return args.strict();
    },
    async (argv) => {
      verbose(argv.verbose);

      const swagger = await new SwaggerCommand(argv.appmapDir).execute();
      console.log(yaml.dump(swagger));
    }
  )
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  })
  .command(InstallCommand)
  .strict()
  .demandCommand()
  .help().argv;
