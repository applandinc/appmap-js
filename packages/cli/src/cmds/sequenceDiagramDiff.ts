import { queue } from 'async';
import { existsSync, statSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import { promisify } from 'util';
import yargs from 'yargs';
import { handleWorkingDirectory } from '../lib/handleWorkingDirectory';
import {
  Actor,
  DiffOptions,
  MoveType,
  format as formatDiagram,
  Formatters,
  Diagram,
  diff,
  buildDiffDiagram,
  setParent,
  actionActors,
  isFunction,
  FormatType,
  buildDiagram,
  Specification,
  Action,
  nodeName,
} from '@appland/sequence-diagram';
import { verbose } from '../utils';
import { join } from 'path';
import { buildAppMap } from '@appland/models';

export const command = 'sequence-diagram-diff base-diagram head-diagram';
export const describe = 'Diff sequence diagrams that are represented as JSON';

export const builder = (args: yargs.Argv) => {
  args.positional('base-diagram', {
    describe: 'base diagram file or directory to compare',
  });
  args.positional('head-diagram', {
    describe: 'head diagram file or directory to compare',
  });

  args.option('directory', {
    describe: 'program working directory',
    type: 'string',
    alias: 'd',
  });
  args.option('output-dir', {
    describe: 'directory in which to save the sequence diagrams',
    default: '.',
  });
  args.option('format', {
    describe: 'output format',
    alias: 'f',
    choices: ['plantuml', 'json', 'text'],
    default: 'plantuml',
  });

  args.option('include', {
    describe: 'code objects to include in the diagram (inclusive of descendants)',
  });
  args.option('exclude', {
    describe: 'code objects to exclude from the diagram',
  });

  return args.strict();
};

type SerializedAction = {
  caller?: string | Actor;
  callee?: string | Actor;
  children?: SerializedAction[];
};

class IncludeFilter {
  expressions: RegExp[] = [];

  addExpression(expression: string) {
    this.expressions.push(new RegExp(expression));
  }

  test(action: Action): boolean {
    if (this.expressions.length === 0) return true;

    let ancestor: Action | undefined = action;
    while (ancestor) {
      const actionName = buildActionName(ancestor);
      if (actionName && this.expressions.find((expr) => expr.test(actionName))) {
        return true;
      }
      ancestor = ancestor.parent;
    }

    return false;
  }
}

class ExcludeFilter {
  expressions: RegExp[] = [];

  addExpression(expression: string) {
    this.expressions.push(new RegExp(expression));
  }

  test(action: Action): boolean {
    const actionName = buildActionName(action);
    if (!actionName) return true;

    return this.expressions.find((expr) => expr.test(actionName)) === undefined;
  }
}

class DiffDiagrams {
  includeFilter: IncludeFilter;
  excludeFilter: ExcludeFilter;

  constructor() {
    this.includeFilter = new IncludeFilter();
    this.excludeFilter = new ExcludeFilter();
  }

  include(expr: string): void {
    this.includeFilter.addExpression(expr);
  }

  exclude(expr: string): void {
    this.excludeFilter.addExpression(expr);
  }

  diff(base: Diagram, head: Diagram): Diagram | undefined {
    return this.diffDiagrams(this.filterDiagram(base), this.filterDiagram(head));
  }

  protected filterDiagram(diagram: Diagram): Diagram {
    const filterActions = (actions: Action[]): Action[] => {
      const result = actions.filter(
        (action) => this.includeFilter.test(action) && this.excludeFilter.test(action)
      );
      result.forEach((action) => {
        action.children = filterActions(action.children);
      });
      return result;
    };

    diagram.rootActions = filterActions(diagram.rootActions);
    return diagram;
  }

  protected diffDiagrams(base: Diagram, head: Diagram): Diagram | undefined {
    const result = diff(base, head, {} as DiffOptions);

    const changes = result.moves.filter((move) => move.moveType !== MoveType.AdvanceBoth);
    if (changes.length === 0) {
      return;
    }

    return buildDiffDiagram(result);
  }
}

function buildSequenceDiagramFromAppMap(fileName: string, appMapData: any): Diagram {
  const appmap = buildAppMap(appMapData).build();
  return buildDiagram(fileName, appmap, Specification.build(appmap, {}));
}

async function readDiagramFile(fileName: string): Promise<Diagram> {
  const jsonData = JSON.parse(await readFile(fileName, 'utf-8')) as any;

  let diagram: Diagram;
  if (jsonData.actors && jsonData.rootActions) {
    diagram = jsonData as Diagram;
  } else if (jsonData.classMap && jsonData.events && jsonData.metadata) {
    diagram = buildSequenceDiagramFromAppMap(fileName, jsonData);
  } else {
    throw new Error(`File '${fileName}' must be AppMap or sequence diagram JSON`);
  }

  const actors = new Map<string, Actor>();
  diagram.actors.forEach((actor) => actors.set(actor.id, actor));

  const resolveActors = (action: SerializedAction): void => {
    if (action.caller) action.caller = actors.get(action.caller as string);
    if (action.callee) action.callee = actors.get(action.callee as string);
    if (action.children) action.children.forEach((child) => resolveActors(child));
  };

  diagram.rootActions.forEach((action) => setParent(action));
  diagram.rootActions.forEach((action) => resolveActors(action as SerializedAction));

  return diagram;
}

async function printDiff(
  diagram: Diagram,
  format: FormatType,
  outputFileName: string,
  description: string
): Promise<Diagram | undefined> {
  const template = formatDiagram(format, diagram, description);

  const outputPath = [outputFileName, template.extension].join('');
  await writeFile(outputPath, template.diagram);

  console.log(`Printed diagram ${outputPath}`);

  return diagram;
}

function buildActionName(action: Action): string | undefined {
  const actor: Actor | undefined = actionActors(action)[1];
  if (!actor) return;

  const separator = isFunction(action) ? (action.static ? '.' : '#') : '#';
  return [actor.id, nodeName(action).replace(/\n/g, ' ')].join(separator);
}

export const handler = async (argv: any) => {
  verbose(argv.verbose);

  if (!Formatters.includes(argv.format)) {
    console.log(`Invalid format: ${argv.format}`);
    process.exitCode = 1;
    return;
  }

  handleWorkingDirectory(argv.directory);
  await mkdir(argv.outputDir, { recursive: true });

  const { baseDiagram: baseDiagramFile, headDiagram: headDiagramFile } = argv;

  const diffDiagrams = new DiffDiagrams();

  if (argv.include)
    (Array.isArray(argv.include) ? argv.include : [argv.include]).forEach((expr: string) =>
      diffDiagrams.include(expr)
    );
  if (argv.exclude)
    (Array.isArray(argv.exclude) ? argv.exclude : [argv.exclude]).forEach((expr: string) =>
      diffDiagrams.exclude(expr)
    );

  [baseDiagramFile, headDiagramFile].forEach((fileName) => {
    if (!existsSync(fileName)) throw new Error(`${fileName} does not exist`);
  });

  const compareFiles = async (): Promise<void> => {
    const baseDiagram = await readDiagramFile(baseDiagramFile);
    const headDiagram = await readDiagramFile(headDiagramFile);

    const diffDiagram = diffDiagrams.diff(baseDiagram, headDiagram);
    if (!diffDiagram) {
      console.log(`${baseDiagramFile} and ${headDiagramFile} are identical`);
      return;
    }

    printDiff(
      diffDiagram,
      argv.format,
      join(argv.outputDir, 'diff'),
      `Diff ${baseDiagramFile} with ${headDiagramFile}`
    );
  };

  const compareDirectories = async (): Promise<void> => {
    const diagramData: Map<string, { diagrams: Map<string, Diagram> }> = new Map();
    diagramData.set(baseDiagramFile, {
      diagrams: new Map<string, Diagram>(),
    });
    diagramData.set(headDiagramFile, {
      diagrams: new Map<string, Diagram>(),
    });

    await Promise.all(
      [...diagramData.keys()].map(async (dirName) => {
        const data = diagramData.get(dirName)!;
        await promisify(glob)(`${dirName}/**/*.sequence.json`).then(async (matches) => {
          const loader = queue(async (matchName: string) => {
            const diagram = await readDiagramFile(matchName);
            const relativePath = matchName.slice(dirName.length + 1);
            data.diagrams.set(relativePath, diagram);
          }, 2);
          matches.forEach((fileName) => loader.push(fileName));
          await loader.drain();
        });
      })
    );

    const diagramNames = new Set<string>();
    for (const fileName of diagramData.get(baseDiagramFile)!.diagrams.keys())
      diagramNames.add(fileName);
    for (const fileName of diagramData.get(headDiagramFile)!.diagrams.keys())
      diagramNames.add(fileName);

    for (const fileName of diagramNames) {
      const baseDiagram = diagramData.get(baseDiagramFile)!.diagrams.get(fileName);
      if (baseDiagram === undefined) {
        console.log(`Diagram ${fileName} exists only in ${headDiagramFile}`);
        continue;
      }

      const headDiagram = diagramData.get(headDiagramFile)!.diagrams.get(fileName);
      if (headDiagram === undefined) {
        console.log(`Diagram ${fileName} exists only in ${baseDiagramFile}`);
        continue;
      }

      const diffDiagram = diffDiagrams.diff(baseDiagram, headDiagram);
      if (!diffDiagram) {
        console.log(`${fileName} is identical`);
        continue;
      }

      printDiff(diffDiagram, argv.format, [fileName, 'diff'].join('.'), `Diff ${fileName}`);
    }
  };

  const isFile = [baseDiagramFile, headDiagramFile].map((fileName) => statSync(fileName).isFile());
  if (isFile.every(Boolean)) {
    await compareFiles();
  } else if (isFile.every((b) => !b)) {
    await compareDirectories();
  } else {
    throw new Error(`Both arguments must be files, or be directories`);
  }
};
