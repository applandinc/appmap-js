import { executeCommand } from '../../lib/executeCommand';
import { handler as restoreCmd } from '../archive/restore';
import { default as openAPICmd } from '../openapi';
import { DefaultMaxAppMapSizeInMB } from '../../lib/fileSizeFilter';

export default async function analyzeArchive(
  archiveDir: string,
  revision: string,
  dir: string
): Promise<void> {
  const analyzer = new ArchiveAnalyzer(archiveDir, revision, dir);
  return analyzer.analyze();
}

class ArchiveAnalyzer {
  constructor(
    public readonly archiveDir: string,
    public readonly revision: string,
    public readonly dir: string
  ) {}

  async analyze() {
    await this.checkout();
    await this.restore();
    await this.inWorkingDirectory(this.dir, async () => {
      await this.openAPI();
      await this.runtimeAnalysis();
    });
  }

  private async checkout() {
    await executeCommand(`git checkout ${this.revision}`, true, true, true);
  }

  private async restore() {
    await restoreCmd({
      outputDir: this.dir,
      archiveDir: this.archiveDir,
      revision: this.revision,
      exact: true,
    });
  }

  private async openAPI() {
    await openAPICmd.handler({
      appmapDir: '.',
      outputFile: 'openapi.yml',
      maxSize: DefaultMaxAppMapSizeInMB,
    });
  }

  private async runtimeAnalysis() {
    await executeCommand(
      `npx @appland/scanner@latest scan  --appmap-dir . --all`,
      true,
      true,
      true
    );
  }

  private async inWorkingDirectory<T>(dir: string, fn: () => Promise<T>) {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await fn();
    } finally {
      process.chdir(cwd);
    }
  }
}
